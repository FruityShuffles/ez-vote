import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { tabulate } from "../_shared/tabulate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user identity using anon key + user's JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const { election_id, close = true } = await req.json();
    if (!election_id) throw new Error("election_id required");

    // Create service role client for data operations (bypasses RLS)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch the election
    const { data: election, error: electionError } = await adminClient
      .from("elections")
      .select("*")
      .eq("id", election_id)
      .single();

    if (electionError || !election) throw new Error("Election not found");
    if (election.status !== "open")
      throw new Error("Election must be open to compute results");

    if (close) {
      // Closing: must be owner
      if (election.owner_id !== user.id) throw new Error("Not election owner");
    } else {
      // Real-time compute: must be participant and realtime_results enabled
      if (!election.realtime_results)
        throw new Error("Real-time results not enabled");
      const isOwner = election.owner_id === user.id;
      if (!isOwner) {
        const { data: voter } = await adminClient
          .from("election_voters")
          .select("user_id")
          .eq("election_id", election_id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!voter) throw new Error("Not a participant");
      }
    }

    // Fetch candidates and ballots
    const { data: candidates } = await adminClient
      .from("candidates")
      .select("*")
      .eq("election_id", election_id)
      .order("position");

    const { data: ballots } = await adminClient
      .from("ballots")
      .select("*")
      .eq("election_id", election_id);

    const algos: string[] = election.algorithms ?? [];

    // Tabulate all algorithms (plus FPTP comparison if enabled) and persist
    const tabulated = tabulate(
      algos,
      election.include_fptp,
      candidates ?? [],
      ballots ?? []
    );

    for (const { algorithm, result_data } of tabulated) {
      await adminClient.from("results").upsert(
        {
          election_id,
          algorithm,
          result_data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "election_id,algorithm" }
      );
    }

    // Close the election only when requested
    if (close) {
      await adminClient
        .from("elections")
        .update({ status: "closed" })
        .eq("id", election_id);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
