import { InfoPageLayout, Section } from '@/components/InfoPageLayout'

// Terms of Service — ported verbatim from the frozen Flutter reference
// (lib/presentation/screens/terms_screen.dart). Static legal copy; keep it
// identical across the cutover.
const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Last updated: February 2026',
    body:
      'By using EZVote you agree to these Terms of Service. ' +
      'If you do not agree, do not use the service.',
  },
  {
    title: 'Use of the Service',
    body:
      'EZVote is provided for personal, non-commercial use only. ' +
      'You may not resell, sublicense, or redistribute the service or ' +
      'any data obtained through it.',
  },
  {
    title: 'Your Content',
    body:
      'You are solely responsible for the elections you create and the ' +
      'content you submit (titles, descriptions, candidate names). You ' +
      'agree not to use EZVote for any unlawful purpose or to collect ' +
      'votes on behalf of others without their knowledge.',
  },
  {
    title: 'Disclaimer of Warranties',
    body:
      'EZVote is provided "as is" and "as available" without any warranty ' +
      'of any kind, express or implied, including but not limited to ' +
      'warranties of merchantability, fitness for a particular purpose, ' +
      'or non-infringement. We do not guarantee that the service will be ' +
      'error-free, secure, or continuously available.',
  },
  {
    title: 'Limitation of Liability',
    body:
      'To the maximum extent permitted by applicable law, we shall not ' +
      'be liable for any indirect, incidental, special, consequential, or ' +
      'punitive damages arising out of or related to your use of EZVote, ' +
      'even if advised of the possibility of such damages.',
  },
  {
    title: 'Changes to These Terms',
    body:
      'We may update these Terms at any time. Continued use of EZVote ' +
      'after changes are posted constitutes your acceptance of the updated Terms.',
  },
  {
    title: 'Governing Law',
    body:
      'These Terms are governed by the laws of the State of Wisconsin, USA. ' +
      'Any disputes shall be resolved in the courts of Wisconsin.',
  },
  {
    title: 'Contact',
    body: 'Questions? Contact us at contact@ez-vote.org.',
  },
]

export function Terms() {
  return (
    <InfoPageLayout title="Terms of Service">
      {SECTIONS.map((s) => (
        <Section key={s.title} title={s.title} body={s.body} />
      ))}
    </InfoPageLayout>
  )
}
