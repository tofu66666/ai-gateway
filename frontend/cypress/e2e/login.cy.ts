describe('Authentication flow', () => {
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
  })

  it('redirects unauthenticated users to login and signs them in', () => {
    cy.visit('/overview')
    cy.location('pathname').should('eq', '/login')

    cy.get('input#email').should('exist').type('admin@example.com')
    cy.get('input#password').should('exist').type('password123')
    cy.contains('button', 'Sign In').click()

    cy.wait('@loginRequest')
    cy.location('pathname').should('eq', '/overview')
    cy.contains('Monitor usage and spending across your projects.').should('be.visible')
  })
})
