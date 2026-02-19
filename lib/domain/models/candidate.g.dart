// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'candidate.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Candidate _$CandidateFromJson(Map<String, dynamic> json) => Candidate(
  id: json['id'] as String,
  electionId: json['election_id'] as String,
  name: json['name'] as String,
  position: (json['position'] as num).toInt(),
  createdAt: DateTime.parse(json['created_at'] as String),
);

Map<String, dynamic> _$CandidateToJson(Candidate instance) => <String, dynamic>{
  'id': instance.id,
  'election_id': instance.electionId,
  'name': instance.name,
  'position': instance.position,
  'created_at': instance.createdAt.toIso8601String(),
};
