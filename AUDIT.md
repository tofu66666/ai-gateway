explanation of what each field in the audit table does.

action: rotate_api_key
target_id: old key id
details: {new_key_id}

action: create_api_key
target_id: new api key id

action: revoke_api_key
target_id: old key id

action: team_add_user
target_id: team_id
details: {user_id}

action: team_remove_user
target_id: team_id
details: {user_id}

action: team_modify_owner
target_id: team_id
details: {user_id}

action: team_create
target_id: team_id
details: {owner_id, name, budget_per_month, warning_threshold}

action: team_modify
target_id: team_id
details: {owner_id, name, budget_per_month, warning_threshold}
(if owner_id is null then the team has been deleted)

action: model_create
target_id: model_id
details: {provider, model, price_per_1m_input, price_per_1m_output, data_processing_country, data_processing_state, prompt}

action: model_modify (no endpoint yet)
target_id: model_id
details: {provider, model, price_per_1m_input, price_per_1m_output, data_processing_country, data_processing_state, prompt}
(if model is null then model has been deleted)

action: project_create
target_id: project id
details: {name, team_id, model_ids, budget_per_month, warning_threshold}

action: project_modify
target_id: project id
details: {name, team_id, model_ids, budget_per_month, warning_threshold}
(if team_id is null then the project has been deleted)

endpoints:

GET /audit_actions
GET /audit_logs?action=x&user_email=x&start=x&end=x

Notes:
- `start` and `end` are Unix epoch timestamps in seconds.
- Example: `start=1725000000&end=1728000000`