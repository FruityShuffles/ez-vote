import 'package:json_annotation/json_annotation.dart';

part 'result.g.dart';

@JsonSerializable(fieldRename: FieldRename.snake)
class ElectionResult {
  final String id;
  final String electionId;
  final String algorithm;
  final Map<String, dynamic> resultData;
  final DateTime createdAt;

  const ElectionResult({
    required this.id,
    required this.electionId,
    required this.algorithm,
    required this.resultData,
    required this.createdAt,
  });

  factory ElectionResult.fromJson(Map<String, dynamic> json) =>
      _$ElectionResultFromJson(json);
  Map<String, dynamic> toJson() => _$ElectionResultToJson(this);
}
