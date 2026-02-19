import 'package:json_annotation/json_annotation.dart';

part 'invite.g.dart';

@JsonSerializable(fieldRename: FieldRename.snake)
class Invite {
  final String id;
  final String electionId;
  final String email;
  final String token;
  final String? acceptedBy;
  final DateTime? acceptedAt;
  final DateTime createdAt;

  const Invite({
    required this.id,
    required this.electionId,
    required this.email,
    required this.token,
    this.acceptedBy,
    this.acceptedAt,
    required this.createdAt,
  });

  bool get isAccepted => acceptedBy != null;

  factory Invite.fromJson(Map<String, dynamic> json) =>
      _$InviteFromJson(json);
  Map<String, dynamic> toJson() => _$InviteToJson(this);
}
