// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'invite.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Invite _$InviteFromJson(Map<String, dynamic> json) => Invite(
  id: json['id'] as String,
  electionId: json['election_id'] as String,
  email: json['email'] as String,
  token: json['token'] as String,
  acceptedBy: json['accepted_by'] as String?,
  acceptedAt: json['accepted_at'] == null
      ? null
      : DateTime.parse(json['accepted_at'] as String),
  createdAt: DateTime.parse(json['created_at'] as String),
);

Map<String, dynamic> _$InviteToJson(Invite instance) => <String, dynamic>{
  'id': instance.id,
  'election_id': instance.electionId,
  'email': instance.email,
  'token': instance.token,
  'accepted_by': instance.acceptedBy,
  'accepted_at': instance.acceptedAt?.toIso8601String(),
  'created_at': instance.createdAt.toIso8601String(),
};
