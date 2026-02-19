import 'package:json_annotation/json_annotation.dart';

part 'candidate.g.dart';

@JsonSerializable(fieldRename: FieldRename.snake)
class Candidate {
  final String id;
  final String electionId;
  final String name;
  final int position;
  final DateTime createdAt;

  const Candidate({
    required this.id,
    required this.electionId,
    required this.name,
    required this.position,
    required this.createdAt,
  });

  factory Candidate.fromJson(Map<String, dynamic> json) =>
      _$CandidateFromJson(json);
  Map<String, dynamic> toJson() => _$CandidateToJson(this);
}
