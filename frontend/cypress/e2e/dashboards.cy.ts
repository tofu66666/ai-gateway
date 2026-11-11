describe('Dashboards', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/api/health', {
      statusCode: 200,
      body: {
        status: 'ok',
        database_configured: true,
        env: 'test',
      },
    })

    cy.intercept('POST', '**/api/login', {
      statusCode: 200,
      body: {
        status: 'ok',
        access_token: 'stub-access-token',
        refresh_token: 'stub-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: 'user-123',
          email: 'admin@example.com',
          role: 'admin',
        },
      },
    }).as('loginRequest')

    cy.intercept('GET', '**/api/me', {
      statusCode: 200,
      body: {
        id: 'user-123',
        email: 'admin@example.com',
        role: 'admin',
      },
    })

    cy.intercept('GET', '**/api/requests', { statusCode: 200, body: [] })
    cy.intercept('GET', '**/api/models', { statusCode: 200, body: [] })
    cy.intercept('GET', '**/api/projects', { statusCode: 200, body: [] })
    cy.intercept('GET', '**/api/team', { statusCode: 200, body: {} })
    cy.intercept('GET', '**/api/stats/*', {
      statusCode: 200,
      body: {
        input: 0,
        output: 0,
        total_cost: 0,
        count: 0,
        success_count: 0,
        failure_count: 0,
        avg_cost: 0,
        success_rate: 0,
        latency_max: 0,
        latency_p50: 0,
        latency_p95: 0,
        latency_p99: 0,
      },
    })
    cy.intercept('GET', '**/api/team/*/users', { statusCode: 200, body: [] })
    cy.intercept('GET', '**/api/team/*/requests', { statusCode: 200, body: [] })
    cy.intercept('GET', '**/api/keys', { statusCode: 200, body: [] })
    cy.intercept('GET', '**/api/audit_actions', { statusCode: 200, body: [] })
    cy.intercept('GET', '**/api/audit_logs*', { statusCode: 200, body: [] })
    cy.intercept('GET', '**/api/api_keys', { statusCode: 200, body: [] })
  })

  it('loads empty dashboards and stays navigable', () => {
    cy.visit('/login')
    cy.get('input#email').type('admin@example.com')
    cy.get('input#password').type('password123')
    cy.contains('button', 'Sign In').click()
    cy.wait('@loginRequest')

    cy.location('pathname').should('eq', '/overview')
    cy.contains('Monitor usage and spending across your projects.').should('be.visible')

    cy.contains('Overview').should('be.visible')
    cy.contains('Breakdown').click()
    cy.location('pathname').should('eq', '/breakdown')
    cy.contains('Breakdown').should('be.visible')

    cy.contains('Requests').click()
    cy.location('pathname').should('eq', '/requests')
    cy.contains('Request History').should('be.visible')

    cy.contains('Models').click()
    cy.location('pathname').should('eq', '/models')
    cy.contains('Available Models').should('be.visible')
    cy.contains('No models available').should('be.visible')

    cy.contains('Keys').click()
    cy.location('pathname').should('eq', '/keys')
    cy.contains('Virtual API Keys').should('be.visible')
    cy.contains('No API keys found.').should('be.visible')

    cy.contains('Audit Logs').click()
    cy.location('pathname').should('eq', '/audit-logs')
    cy.contains('Activity').should('be.visible')
    cy.contains('No audit logs match these filters.').should('be.visible')
  })
})
