import 'package:json_annotation/json_annotation.dart';

part 'election.g.dart';

enum ElectionStatus {
  draft,
  open,
  closed,
}

enum VotingAlgorithm {
  approval,
  irv,
  star,
}

@JsonSerializable(fieldRename: FieldRename.snake)
class Election {
  final String id;
  final String ownerId;
  final String title;
  final String? description;
  final ElectionStatus status;
  final List<String> algorithms;
  final String inviteMode;
  final bool allowVoterCandidates;
  final bool realtimeResults;
  final bool includeFptp;
  final bool publicBallots;
  final DateTime candidatesUpdatedAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  const Election({
    required this.id,
    required this.ownerId,
    required this.title,
    this.description,
    required this.status,
    required this.algorithms,
    required this.inviteMode,
    this.allowVoterCandidates = false,
    this.realtimeResults = false,
    this.includeFptp = true,
    this.publicBallots = false,
    required this.candidatesUpdatedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Election.fromJson(Map<String, dynamic> json) =>
      _$ElectionFromJson(json);
  Map<String, dynamic> toJson() => _$ElectionToJson(this);
}
