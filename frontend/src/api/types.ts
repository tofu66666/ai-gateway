export type Role = 'user' | 'team_lead' | 'admin'

export type User = {
  id: string
  email: string
  role: Role
}
