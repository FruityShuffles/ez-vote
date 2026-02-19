// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'election.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Election _$ElectionFromJson(Map<String, dynamic> json) => Election(
  id: json['id'] as String,
  ownerId: json['owner_id'] as String,
  title: json['title'] as String,
  description: json['description'] as String?,
  status: $enumDecode(_$ElectionStatusEnumMap, json['status']),
  algorithms: (json['algorithms'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  inviteMode: json['invite_mode'] as String,
  createdAt: DateTime.parse(json['created_at'] as String),
  updatedAt: DateTime.parse(json['updated_at'] as String),
);

Map<String, dynamic> _$ElectionToJson(Election instance) => <String, dynamic>{
  'id': instance.id,
  'owner_id': instance.ownerId,
  'title': instance.title,
  'description': instance.description,
  'status': _$ElectionStatusEnumMap[instance.status]!,
  'algorithms': instance.algorithms,
  'invite_mode': instance.inviteMode,
  'created_at': instance.createdAt.toIso8601String(),
  'updated_at': instance.updatedAt.toIso8601String(),
};

const _$ElectionStatusEnumMap = {
  ElectionStatus.draft: 'draft',
  ElectionStatus.open: 'open',
  ElectionStatus.closed: 'closed',
};
