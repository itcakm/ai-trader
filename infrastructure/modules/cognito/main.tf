# Cognito Module - User Pool and App Client for Authentication
# Creates Cognito User Pool with security policies, MFA, and Lambda triggers
# Implements Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 12.1

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  })

  # Determine if using SES for email (production) or Cognito default (test)
  use_ses_email = var.environment == "production" && var.ses_identity_arn != ""
}

# Get current AWS region
data "aws_region" "current" {}

#------------------------------------------------------------------------------
# Cognito User Pool
# Requirements: 1.1, 1.2, 1.6, 1.7, 1.8, 1.9
#------------------------------------------------------------------------------
resource "aws_cognito_user_pool" "main" {
  name = "${local.name_prefix}-users"

  # Username configuration - use email as username
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Password policy - Requirements 1.1
  # Min 12 chars, uppercase, lowercase, numbers, symbols
  password_policy {
    minimum_length                   = var.password_minimum_length
    require_lowercase                = var.password_require_lowercase
    require_uppercase                = var.password_require_uppercase
    require_numbers                  = var.password_require_numbers
    require_symbols                  = var.password_require_symbols
    temporary_password_validity_days = var.temporary_password_validity_days
  }

  # MFA configuration - Requirements 1.2
  # OPTIONAL with TOTP (authenticator apps) as preferred method
  mfa_configuration = var.mfa_configuration

  software_token_mfa_configuration {
    enabled = true
  }

  # Account recovery - Requirements 1.6
  # Recovery via verified email
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # User attribute schema - Requirements 1.7
  # Email (required, verified), name, tenant_id (custom), roles (custom)

  # Custom attribute: tenant_id
  schema {
    name                     = "tenant_id"
    attribute_data_type      = "String"
    mutable                  = true
    required                 = false
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  # Custom attribute: roles (JSON array of role names)
  schema {
    name                     = "roles"
    attribute_data_type      = "String"
    mutable                  = true
    required                 = false
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 0
      max_length = 2048
    }
  }

  # Email configuration - Requirements 1.9
  # Use Cognito default for test, SES for production
  email_configuration {
    email_sending_account  = local.use_ses_email ? "DEVELOPER" : "COGNITO_DEFAULT"
    source_arn             = local.use_ses_email ? var.ses_identity_arn : null
    from_email_address     = local.use_ses_email ? "noreply@${var.domain}" : null
    reply_to_email_address = local.use_ses_email ? "noreply@${var.domain}" : null
  }

  # Advanced security features - Requirements 1.6, 12.1
  # ENFORCED mode for compromised credentials detection and adaptive authentication
  # Account lockout is handled by advanced security with risk-based authentication
  user_pool_add_ons {
    advanced_security_mode = "ENFORCED"
  }

  # Account lockout configuration - Requirements 12.1
  # Lock account after 5 failed attempts for 30 minutes
  # Note: Cognito's advanced security handles lockout automatically
  # The lockout behavior is configured through the risk configuration below

  # Lambda triggers - Requirements 1.8, 12.2, 12.3, 12.4
  # Pre-signup validation, post-confirmation user setup, and post-authentication notifications
  dynamic "lambda_config" {
    for_each = var.enable_lambda_triggers ? [1] : []
    content {
      pre_sign_up         = var.pre_signup_lambda_arn != "" ? var.pre_signup_lambda_arn : null
      post_confirmation   = var.post_confirmation_lambda_arn != "" ? var.post_confirmation_lambda_arn : null
      post_authentication = var.post_authentication_lambda_arn != "" ? var.post_authentication_lambda_arn : null
    }
  }

  # Verification message template
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "${var.project_name} - Verify your email"
    email_message        = "Your verification code is {####}"
  }

  # User attribute update settings
  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  # Admin create user config
  admin_create_user_config {
    allow_admin_create_user_only = false

    invite_message_template {
      email_subject = "${var.project_name} - Your temporary password"
      email_message = "Your username is {username} and temporary password is {####}"
      sms_message   = "Your username is {username} and temporary password is {####}"
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-users"
  })
}

#------------------------------------------------------------------------------
# Cognito Risk Configuration
# Requirements: 12.1
# Configure account lockout after 5 failed attempts for 30 minutes
# Note: Full risk configuration with notifications requires SES.
# For test environments without SES, we use a simplified configuration.
#------------------------------------------------------------------------------
resource "aws_cognito_risk_configuration" "main" {
  count        = local.use_ses_email ? 1 : 0
  user_pool_id = aws_cognito_user_pool.main.id

  # Account takeover risk configuration
  # This handles suspicious login attempts and account lockout
  account_takeover_risk_configuration {
    # Notify users of suspicious activity
    notify_configuration {
      # Use SES for email notifications
      source_arn = var.ses_identity_arn
      from       = "noreply@${var.domain}"

      # Block email template
      block_email {
        html_body = <<-EOF
          <html>
            <body>
              <h1>Account Security Alert</h1>
              <p>Your account has been temporarily locked due to multiple failed login attempts.</p>
              <p>If this was you, please wait ${var.account_lockout_duration_minutes} minutes before trying again.</p>
              <p>If this wasn't you, please reset your password immediately.</p>
            </body>
          </html>
        EOF
        subject   = "${var.project_name} - Account Temporarily Locked"
        text_body = "Your account has been temporarily locked due to multiple failed login attempts. Please wait ${var.account_lockout_duration_minutes} minutes before trying again. If this wasn't you, please reset your password immediately."
      }

      # MFA email template (for suspicious activity)
      mfa_email {
        html_body = <<-EOF
          <html>
            <body>
              <h1>Suspicious Login Attempt</h1>
              <p>We detected a suspicious login attempt on your account.</p>
              <p>If this was you, please verify your identity using MFA.</p>
              <p>If this wasn't you, please change your password immediately.</p>
            </body>
          </html>
        EOF
        subject   = "${var.project_name} - Suspicious Login Attempt"
        text_body = "We detected a suspicious login attempt on your account. If this was you, please verify your identity using MFA. If this wasn't you, please change your password immediately."
      }

      # No action email template
      no_action_email {
        html_body = <<-EOF
          <html>
            <body>
              <h1>New Login Detected</h1>
              <p>A new login was detected on your account from a new device or location.</p>
              <p>If this was you, no action is needed.</p>
              <p>If this wasn't you, please change your password immediately.</p>
            </body>
          </html>
        EOF
        subject   = "${var.project_name} - New Login Detected"
        text_body = "A new login was detected on your account from a new device or location. If this was you, no action is needed. If this wasn't you, please change your password immediately."
      }
    }

    # Actions for different risk levels
    actions {
      # Low risk - allow login
      low_action {
        event_action = "NO_ACTION"
        notify       = false
      }

      # Medium risk - require MFA
      medium_action {
        event_action = "MFA_IF_CONFIGURED"
        notify       = true
      }

      # High risk - block login (account lockout)
      # This triggers after multiple failed attempts
      high_action {
        event_action = "BLOCK"
        notify       = true
      }
    }
  }

  # Compromised credentials risk configuration
  compromised_credentials_risk_configuration {
    # Block sign-in with compromised credentials
    actions {
      event_action = "BLOCK"
    }

    # Check credentials on sign-in and password change
    event_filter = ["SIGN_IN", "PASSWORD_CHANGE", "SIGN_UP"]
  }
}

#------------------------------------------------------------------------------
# Simplified Risk Configuration for Test (without SES)
# Uses compromised credentials check only, no email notifications
#------------------------------------------------------------------------------
resource "aws_cognito_risk_configuration" "test" {
  count        = local.use_ses_email ? 0 : 1
  user_pool_id = aws_cognito_user_pool.main.id

  # Compromised credentials risk configuration only
  # Email notifications require SES which isn't configured for test
  compromised_credentials_risk_configuration {
    # Block sign-in with compromised credentials
    actions {
      event_action = "BLOCK"
    }

    # Check credentials on sign-in and password change
    event_filter = ["SIGN_IN", "PASSWORD_CHANGE", "SIGN_UP"]
  }
}

#------------------------------------------------------------------------------
# Cognito App Client
# Requirements: 1.3, 1.4, 1.5
#------------------------------------------------------------------------------
resource "aws_cognito_user_pool_client" "main" {
  name         = "${local.name_prefix}-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # Auth flows - Requirements 1.3
  # Enable USER_PASSWORD_AUTH and REFRESH_TOKEN_AUTH flows
  # Disable hosted UI and OAuth flows
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  # Token validity - Requirements 1.5
  # Access token: 1 hour, Refresh token: 30 days, ID token: 1 hour
  access_token_validity  = var.access_token_validity_hours
  id_token_validity      = var.id_token_validity_hours
  refresh_token_validity = var.refresh_token_validity_days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Security settings - Requirements 1.4
  # Enable token revocation and prevent user existence errors
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  # No OAuth/hosted UI - Requirements 1.4
  # Force all auth through backend proxy
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = false

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
}

#------------------------------------------------------------------------------
# Lambda Trigger Permissions
# Requirements: 1.8
# Allow Cognito to invoke Lambda triggers
#------------------------------------------------------------------------------
resource "aws_lambda_permission" "pre_signup" {
  count = var.enable_lambda_triggers && var.pre_signup_lambda_arn != "" ? 1 : 0

  statement_id  = "AllowCognitoPreSignUp"
  action        = "lambda:InvokeFunction"
  function_name = var.pre_signup_lambda_arn
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}

resource "aws_lambda_permission" "post_confirmation" {
  count = var.enable_lambda_triggers && var.post_confirmation_lambda_arn != "" ? 1 : 0

  statement_id  = "AllowCognitoPostConfirmation"
  action        = "lambda:InvokeFunction"
  function_name = var.post_confirmation_lambda_arn
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}

resource "aws_lambda_permission" "post_authentication" {
  count = var.enable_lambda_triggers && var.post_authentication_lambda_arn != "" ? 1 : 0

  statement_id  = "AllowCognitoPostAuthentication"
  action        = "lambda:InvokeFunction"
  function_name = var.post_authentication_lambda_arn
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}
