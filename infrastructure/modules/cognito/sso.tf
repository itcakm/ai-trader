# SSO Configuration for Cognito User Pool
# Supports SAML 2.0 and OIDC identity provider integration
# Requirements: 7.1, 7.2, 7.6

#------------------------------------------------------------------------------
# User Pool Domain (required for SSO)
# This creates a domain for the hosted UI and SSO callbacks
#------------------------------------------------------------------------------
resource "aws_cognito_user_pool_domain" "main" {
  count = var.enable_sso ? 1 : 0

  domain       = var.cognito_domain != "" ? var.cognito_domain : "${local.name_prefix}-auth"
  user_pool_id = aws_cognito_user_pool.main.id

  # Optional: Use custom domain with certificate
  # certificate_arn = var.custom_domain_certificate_arn
}

#------------------------------------------------------------------------------
# SAML Identity Providers
# Requirements: 7.1
#------------------------------------------------------------------------------
resource "aws_cognito_identity_provider" "saml" {
  for_each = var.enable_sso ? var.saml_providers : {}

  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = each.key
  provider_type = "SAML"

  provider_details = {
    MetadataURL           = lookup(each.value, "metadata_url", null)
    MetadataFile          = lookup(each.value, "metadata_file", null)
    IDPSignout            = lookup(each.value, "idp_signout", "false")
    EncryptedResponses    = lookup(each.value, "encrypted_responses", "false")
    RequestSigningAlgorithm = lookup(each.value, "signing_algorithm", "rsa-sha256")
  }

  # Attribute mapping - Requirements: 7.6
  # Maps external IdP attributes to Cognito user attributes
  attribute_mapping = merge(
    {
      email    = lookup(each.value, "email_attribute", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress")
      name     = lookup(each.value, "name_attribute", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name")
      username = lookup(each.value, "username_attribute", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier")
    },
    lookup(each.value, "custom_attribute_mapping", {})
  )

  idp_identifiers = lookup(each.value, "idp_identifiers", [])

  lifecycle {
    ignore_changes = [
      provider_details["MetadataFile"]
    ]
  }
}

#------------------------------------------------------------------------------
# OIDC Identity Providers
# Requirements: 7.2
#------------------------------------------------------------------------------
resource "aws_cognito_identity_provider" "oidc" {
  for_each = var.enable_sso ? var.oidc_providers : {}

  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = each.key
  provider_type = "OIDC"

  provider_details = {
    client_id                     = each.value.client_id
    client_secret                 = each.value.client_secret
    authorize_scopes              = lookup(each.value, "authorize_scopes", "openid email profile")
    oidc_issuer                   = each.value.issuer_url
    attributes_request_method     = lookup(each.value, "attributes_request_method", "GET")
    authorize_url                 = lookup(each.value, "authorize_url", null)
    token_url                     = lookup(each.value, "token_url", null)
    attributes_url                = lookup(each.value, "attributes_url", null)
    jwks_uri                      = lookup(each.value, "jwks_uri", null)
  }

  # Attribute mapping - Requirements: 7.6
  # Maps external IdP attributes to Cognito user attributes
  attribute_mapping = merge(
    {
      email    = lookup(each.value, "email_attribute", "email")
      name     = lookup(each.value, "name_attribute", "name")
      username = lookup(each.value, "username_attribute", "sub")
    },
    lookup(each.value, "custom_attribute_mapping", {})
  )

  idp_identifiers = lookup(each.value, "idp_identifiers", [])
}

#------------------------------------------------------------------------------
# App Client for SSO (with OAuth flows enabled)
# This is a separate client specifically for SSO flows
#------------------------------------------------------------------------------
resource "aws_cognito_user_pool_client" "sso" {
  count = var.enable_sso ? 1 : 0

  name         = "${local.name_prefix}-sso-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # Enable OAuth flows for SSO
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]

  # Callback URLs for SSO
  callback_urls = var.sso_callback_urls
  logout_urls   = var.sso_logout_urls

  # Supported identity providers
  supported_identity_providers = concat(
    ["COGNITO"],
    keys(var.saml_providers),
    keys(var.oidc_providers)
  )

  # Auth flows
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  # Token validity (same as main client)
  access_token_validity  = var.access_token_validity_hours
  id_token_validity      = var.id_token_validity_hours
  refresh_token_validity = var.refresh_token_validity_days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Security settings
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true
  generate_secret               = true

  # Read/write attributes
  read_attributes = [
    "email",
    "email_verified",
    "name",
    "custom:tenant_id",
    "custom:roles"
  ]

  write_attributes = [
    "email",
    "name",
    "custom:tenant_id",
    "custom:roles"
  ]

  depends_on = [
    aws_cognito_identity_provider.saml,
    aws_cognito_identity_provider.oidc
  ]
}

#------------------------------------------------------------------------------
# SSO Provider Configuration Storage (DynamoDB)
# Stores additional SSO provider metadata for the backend
#------------------------------------------------------------------------------
resource "aws_dynamodb_table" "sso_providers" {
  count = var.enable_sso && var.create_sso_config_table ? 1 : 0

  name         = "${local.name_prefix}-sso-providers"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "providerId"

  attribute {
    name = "providerId"
    type = "S"
  }

  attribute {
    name = "tenantId"
    type = "S"
  }

  global_secondary_index {
    name            = "tenantId-index"
    hash_key        = "tenantId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = var.environment == "production"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-sso-providers"
  })
}

#------------------------------------------------------------------------------
# SSO State Storage (DynamoDB)
# Stores SSO state parameters for CSRF protection
# Requirements: 7.9
#------------------------------------------------------------------------------
resource "aws_dynamodb_table" "sso_state" {
  count = var.enable_sso && var.create_sso_config_table ? 1 : 0

  name         = "${local.name_prefix}-sso-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "state"

  attribute {
    name = "state"
    type = "S"
  }

  # TTL for automatic cleanup of expired state entries
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-sso-state"
  })
}
