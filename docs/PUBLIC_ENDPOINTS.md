# Public API Endpoints

Base path: `/api/v1`

All authenticated requests must send `Authorization: Bearer <token>`.

Access levels:
- **Public**: No authentication required.
- **Optional Auth**: Works anonymously; returns caller-specific fields (such as membership or follow state) when a valid token is provided.
- **Authenticated**: Requires a valid signed-in user token.
- **Group Moderator / Owner**: Requires Group Moderator, Group Owner, or Admin privileges.
- **Group Owner**: Requires Group Owner privileges.
- **Admin**: Requires System Admin privileges.

---

## Authentication

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public | Register a new user account and receive an access token. |
| `POST` | `/api/v1/auth/login` | Public | Sign in with email or username and password to receive an access token. |
| `POST` | `/api/v1/auth/oauth` | Public | Sign in or register using a Google or GitHub OAuth2 authorization code. |
| `POST` | `/api/v1/auth/logout` | Authenticated | Revoke the caller's active access token. |

---

## Users

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/users/me` | Authenticated | Get the signed-in user's full profile, privacy preferences, linked OAuth providers, and follow counts. |
| `PATCH` | `/api/v1/users/me` | Authenticated | Update the signed-in user's profile fields or privacy settings. |
| `PUT` | `/api/v1/users/me/password` | Authenticated | Change the signed-in user's password after verifying the current password. |
| `GET` | `/api/v1/users/username/{username}` | Optional Auth | View a user's public profile by username. |
| `GET` | `/api/v1/users/{id}` | Optional Auth | View a user's public profile by user ID. |
| `POST` | `/api/v1/users/{id}/follow` | Authenticated | Follow another user. |
| `DELETE` | `/api/v1/users/{id}/follow` | Authenticated | Unfollow a user. |
| `GET` | `/api/v1/users/{id}/followers` | Optional Auth | List users following the specified user when allowed by privacy settings. |
| `GET` | `/api/v1/users/{id}/following` | Optional Auth | List users followed by the specified user when allowed by privacy settings. |

---

## Groups

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/groups` | Optional Auth | Browse or search active learning groups with optional visibility filtering. |
| `POST` | `/api/v1/groups` | Authenticated | Create a new learning group with a generated invitation code and assign the caller as owner. |
| `GET` | `/api/v1/groups/me` | Authenticated | List learning groups that the signed-in user belongs to. |
| `GET` | `/api/v1/groups/code/{code}` | Optional Auth | Look up a learning group by its invitation code. |
| `GET` | `/api/v1/groups/{id}` | Optional Auth | View a learning group's details and the caller's membership role. |
| `PATCH` | `/api/v1/groups/{id}` | Group Owner | Update group metadata, visibility, join policy, or shared password. |
| `DELETE` | `/api/v1/groups/{id}` | Group Owner | Delete a learning group and clear its memberships. |
| `POST` | `/api/v1/groups/{id}/transfer-ownership` | Group Owner | Transfer group ownership to another active group member. |
| `POST` | `/api/v1/groups/{id}/join` | Authenticated | Join an open public group or a password-protected private group. |
| `POST` | `/api/v1/groups/{id}/leave` | Authenticated | Leave a learning group as a non-owner member. |
| `POST` | `/api/v1/groups/{id}/requests` | Authenticated | Submit a request to join a private group that requires moderator approval. |
| `GET` | `/api/v1/groups/{id}/requests` | Group Moderator / Owner | List join requests for the group with optional status filtering. |
| `PATCH` | `/api/v1/groups/{id}/requests/{requestId}` | Group Moderator / Owner | Approve or reject a pending group join request. |
| `GET` | `/api/v1/groups/{id}/members` | Optional Auth | List members of a group (private groups require existing membership). |
| `PATCH` | `/api/v1/groups/{id}/members/{userId}/role` | Group Owner | Assign or revoke moderator privileges for a group member. |
| `DELETE` | `/api/v1/groups/{id}/members/{userId}` | Group Moderator / Owner | Remove a member from the group. |
| `GET` | `/api/v1/groups/{id}/bans` | Group Moderator / Owner | List users currently banned from the group. |
| `POST` | `/api/v1/groups/{id}/bans` | Group Moderator / Owner | Ban a user from the group and prevent them from re-joining. |
| `DELETE` | `/api/v1/groups/{id}/bans/{userId}` | Group Moderator / Owner | Revoke an active group ban for a user. |

---

## Assessments

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/assessments` | Authenticated | List assessments in a group filtered by caller access level, visibility, or practice availability. |
| `POST` | `/api/v1/assessments` | Group Moderator / Owner | Create a structured assessment from JSON questions and answer keys. |
| `POST` | `/api/v1/assessments/pdf` | Group Moderator / Owner | Create an assessment by uploading a PDF exam file and optional answer keys. |
| `GET` | `/api/v1/assessments/favorites` | Authenticated | List active assessments bookmarked as favorites by the signed-in user. |
| `GET` | `/api/v1/assessments/{id}` | Authenticated | View assessment metadata when accessible to the caller. |
| `PUT` | `/api/v1/assessments/{id}` | Group Moderator / Owner | Update assessment metadata, structured questions, or uploaded PDF file. |
| `DELETE` | `/api/v1/assessments/{id}` | Group Moderator / Owner | Delete an assessment. |
| `GET` | `/api/v1/assessments/{id}/content` | Authenticated | Retrieve public questions (without answer keys) or a temporary PDF download URL. |
| `GET` | `/api/v1/assessments/{id}/answer-key` | Group Moderator / Owner | View the answer keys and grading rubrics for an assessment. |
| `PUT` | `/api/v1/assessments/{id}/answer-key` | Group Moderator / Owner | Create or update the mapped answer keys for an assessment. |
| `POST` | `/api/v1/assessments/{id}/favorite` | Authenticated | Bookmark an accessible assessment as a favorite. |
| `DELETE` | `/api/v1/assessments/{id}/favorite` | Authenticated | Remove an assessment from the signed-in user's favorites. |

---

## Contests

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/contests` | Optional Auth | Browse public contests or list group contests filtered by status, phase, or keyword. |
| `POST` | `/api/v1/contests` | Group Moderator / Owner | Create and schedule a contest linked to an assessment in the group. |
| `GET` | `/api/v1/contests/{id}` | Optional Auth | View contest details, schedule, submission policy, and current phase. |
| `PATCH` | `/api/v1/contests/{id}` | Group Moderator / Owner | Update an upcoming contest or adjust allowed details and end time of an ongoing contest. |
| `DELETE` | `/api/v1/contests/{id}` | Group Moderator / Owner | Delete a contest that is not currently ongoing. |
| `POST` | `/api/v1/contests/{id}/cancel` | Group Moderator / Owner | Cancel a draft, upcoming, or ongoing contest. |
| `GET` | `/api/v1/contests/{id}/participation` | Authenticated | Check whether the signed-in user is eligible to participate in the contest. |

---

## Submissions

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/submissions` | Authenticated | Submit answers for a contest or practice assessment and queue grading. |
| `GET` | `/api/v1/submissions/me` | Authenticated | List submission attempts made by the signed-in user. |
| `GET` | `/api/v1/submissions` | Group Moderator / Owner | List submissions belonging to a group or contest. |
| `GET` | `/api/v1/submissions/{id}` | Authenticated | View submission scores, grading status, and per-question answer details. |
| `PATCH` | `/api/v1/submissions/{id}/grade` | Group Moderator / Owner | Record manual essay grades and publish the final combined submission score. |

---

## Notifications

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/notifications` | Authenticated | Fetch notifications for the signed-in user with optional unread-only filtering. |
| `PATCH` | `/api/v1/notifications/{notification_id}/read` | Authenticated | Mark one of the signed-in user's notifications as read. |

---

## Admin

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/users` | Admin | Search and list all user accounts across the platform. |
| `GET` | `/api/v1/admin/users/{id}` | Admin | View full account and moderation details for a user. |
| `PATCH` | `/api/v1/admin/users/{id}/status` | Admin | Suspend, ban, or reactivate a user account. |
| `PATCH` | `/api/v1/admin/users/{id}/role` | Admin | Grant or revoke administrator privileges for a user account. |
| `GET` | `/api/v1/admin/groups` | Admin | Search and list all learning groups across the platform. |
| `GET` | `/api/v1/admin/groups/{id}` | Admin | View full group metadata and moderation status. |
| `PATCH` | `/api/v1/admin/groups/{id}/status` | Admin | Suspend or restore a learning group. |
| `DELETE` | `/api/v1/admin/groups/{id}` | Admin | Delete a policy-violating learning group. |
| `GET` | `/api/v1/admin/assessments` | Admin | Search and list all assessments across the platform. |
| `GET` | `/api/v1/admin/assessments/{id}` | Admin | View full assessment metadata and moderation status. |
| `PATCH` | `/api/v1/admin/assessments/{id}/status` | Admin | Hide or restore an assessment. |
| `DELETE` | `/api/v1/admin/assessments/{id}` | Admin | Delete a policy-violating assessment. |
| `GET` | `/api/v1/admin/contests` | Admin | Search and list all contests across the platform. |
| `GET` | `/api/v1/admin/contests/{id}` | Admin | View full contest details and moderation metadata. |
| `PATCH` | `/api/v1/admin/contests/{id}/status` | Admin | Publish, unpublish, or cancel a contest. |
| `DELETE` | `/api/v1/admin/contests/{id}` | Admin | Delete a policy-violating contest. |
