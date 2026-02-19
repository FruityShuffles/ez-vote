import 'package:json_annotation/json_annotation.dart';

part 'profile.g.dart';

@JsonSerializable(fieldRename: FieldRename.snake)
class Profile {
  final String id;
  final String email;
  final String? displayName;
  final DateTime createdAt;

  const Profile({
    required this.id,
    required this.email,
    this.displayName,
    required this.createdAt,
  });

  factory Profile.fromJson(Map<String, dynamic> json) =>
      _$ProfileFromJson(json);
  Map<String, dynamic> toJson() => _$ProfileToJson(this);
}
