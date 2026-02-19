// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ballot.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Ballot _$BallotFromJson(Map<String, dynamic> json) => Ballot(
  id: json['id'] as String,
  electionId: json['election_id'] as String,
  voterId: json['voter_id'] as String,
  payload: json['payload'] as Map<String, dynamic>,
  createdAt: DateTime.parse(json['created_at'] as String),
  updatedAt: DateTime.parse(json['updated_at'] as String),
);

Map<String, dynamic> _$BallotToJson(Ballot instance) => <String, dynamic>{
  'id': instance.id,
  'election_id': instance.electionId,
  'voter_id': instance.voterId,
  'payload': instance.payload,
  'created_at': instance.createdAt.toIso8601String(),
  'updated_at': instance.updatedAt.toIso8601String(),
};
