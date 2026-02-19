import 'package:json_annotation/json_annotation.dart';

part 'ballot.g.dart';

@JsonSerializable(fieldRename: FieldRename.snake)
class Ballot {
  final String id;
  final String electionId;
  final String voterId;
  final Map<String, dynamic> payload;
  final DateTime createdAt;
  final DateTime updatedAt;

  const Ballot({
    required this.id,
    required this.electionId,
    required this.voterId,
    required this.payload,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Ballot.fromJson(Map<String, dynamic> json) =>
      _$BallotFromJson(json);
  Map<String, dynamic> toJson() => _$BallotToJson(this);
}
