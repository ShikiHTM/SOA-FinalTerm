# Frontend RBAC Design

**✓** Allowed · **Conditional** Requires ownership, membership, or resource policy · **—** Not applicable

`MEMBER`, `MODERATOR`, and `OWNER` are group-scoped roles inside a specific learning group and inherit standard `USER` capabilities. `ADMIN` is a system-wide role. Authoritative enforcement always happens on the backend services behind the API Gateway.

| Action | Guest | User | Member | Moderator | Owner | Admin | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sign in / Sign up / OAuth2 | ✓ | — | — | — | — | — | Public authentication routes |
| Browse public groups & lookup by code | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Private group content remains hidden from non-members |
| View public user profile & network | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Respects user privacy preferences |
| Browse public contests | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Group-private contests require group membership |
| Manage own profile, password & favorites | — | ✓ | ✓ | ✓ | ✓ | ✓ | Authenticated user scope |
| Follow / unfollow users | — | ✓ | ✓ | ✓ | ✓ | ✓ | Cannot follow self or suspended users |
| Create group | — | ✓ | ✓ | ✓ | ✓ | ✓ | Creator becomes group Owner |
| Join / request / leave group | — | Conditional | Conditional | Conditional | — | — | Owner must transfer ownership or delete group |
| Take contest & submit answers | — | Conditional | Conditional | Conditional | — | Conditional | Governed by group membership, schedule, and policy |
| Practice enabled group assessments | — | — | ✓ | ✓ | ✓ | ✓ | Only when `is_practice_enabled` is enabled |
| Manage group members, requests & bans | — | — | — | ✓ | ✓ | — | Moderators cannot remove/ban other moderators or owner |
| Manage group assessments, contests & essay grading | — | — | — | ✓ | ✓ | — | Scoped to managed groups |
| Update group settings, moderators, transfer & delete | — | — | — | — | ✓ | — | Exclusive to group Owner |
| Platform moderation console (`/admin`) | — | — | — | — | — | ✓ | Manage users, groups, assessments, and contests |
