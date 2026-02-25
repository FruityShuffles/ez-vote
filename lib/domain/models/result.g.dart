// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ElectionResult _$ElectionResultFromJson(Map<String, dynamic> json) =>
    ElectionResult(
      id: json['id'] as String,
      electionId: json['election_id'] as String,
      algorithm: json['algorithm'] as String,
      resultData: json['result_data'] as Map<String, dynamic>,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );

Map<String, dynamic> _$ElectionResultToJson(ElectionResult instance) =>
    <String, dynamic>{
      'id': instance.id,
      'election_id': instance.electionId,
      'algorithm': instance.algorithm,
      'result_data': instance.resultData,
      'created_at': instance.createdAt.toIso8601String(),
      'updated_at': instance.updatedAt.toIso8601String(),
    };
