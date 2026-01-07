# Cognito Module Variables

variable "environment" {
  type        = string
  description = "Environment name (test/production)"
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
  default     = "crypto-trading"
}

variable "tags" {
  type        = map(string)
  description = "Additional tags to apply to resources"
  default     = {}
}

#------------------------------------------------------------------------------
# Password Policy Configuration
#------------------------------------------------------------------------------
variable "password_minimum_length" {
  type        = number
  description = "Minimum password length"
  default     = 12
}

variable "password_require_lowercase" {
  type        = bool
  description = "Require lowercase characters in password"
  default     = true
}

variable "password_require_uppercase" {
  type        = bool
  description = "Require uppercase characters in password"
  default     = true
}

variable "password_require_numbers" {
  type        = bool
  description = "Require numbers in password"
  default     = true
}

variable "password_require_symbols" {
  type        = bool
  description = "Require symbols in password"
  default     = true
}

variable "temporary_password_validity_days" {
  type        = number
  description = "Number of days a temporary password is valid"
  default     = 7
}

#------------------------------------------------------------------------------
# Account Lockout Configuration
# Requirements: 12.1
#------------------------------------------------------------------------------
variable "account_lockout_duration_minutes" {
  type        = number
  description = "Duration in minutes to lock account after failed attempts"
  default     = 30
}

variable "max_failed_login_attempts" {
  type        = number
  description = "Maximum failed login attempts before account lockout"
  default     = 5
}

#------------------------------------------------------------------------------
# MFA Configuration
#------------------------------------------------------------------------------
variable "mfa_configuration" {
  type        = string
  description = "MFA configuration: OFF, ON, or OPTIONAL"
  default     = "OPTIONAL"
}

#------------------------------------------------------------------------------
# Token Validity Configuration
#------------------------------------------------------------------------------
variable "access_token_validity_hours" {
  type        = number
  description = "Access token validity in hours"
  default     = 1
}

variable "id_token_validity_hours" {
  type        = number
  description = "ID token validity in hours"
  default     = 1
}

variable "refresh_token_validity_days" {
  type        = number
  description = "Refresh token validity in days"
  default     = 30
}

#------------------------------------------------------------------------------
# Email Configuration
#------------------------------------------------------------------------------
variable "domain" {
  type        = string
  description = "Domain for email from address"
  default     = ""
}

variable "ses_identity_arn" {
  type        = string
  description = "ARN of SES identity for production email sending"
  default     = ""
}

#------------------------------------------------------------------------------
# Lambda Trigger Configuration
#------------------------------------------------------------------------------
variable "pre_signup_lambda_arn" {
  type        = string
  description = "ARN of the pre-signup Lambda trigger function"
  default     = ""
}

variable "post_confirmation_lambda_arn" {
  type        = string
  description = "ARN of the post-confirmation Lambda trigger function"
  default     = ""
}

variable "post_authentication_lambda_arn" {
  type        = string
  description = "ARN of the post-authentication Lambda trigger function"
  default     = ""
}

variable "enable_lambda_triggers" {
  type        = bool
  description = "Enable Lambda triggers (set to true when Lambda functions are deployed)"
  default     = false
}

#------------------------------------------------------------------------------
# SSO Configuration
# Requirements: 7.1, 7.2, 7.6
#------------------------------------------------------------------------------
variable "enable_sso" {
  type        = bool
  description = "Enable SSO (SAML/OIDC) identity provider integration"
  default     = false
}

variable "cognito_domain" {
  type        = string
  description = "Custom domain prefix for Cognito hosted UI (required for SSO)"
  default     = ""
}

variable "saml_providers" {
  type = map(object({
    metadata_url             = optional(string)
    metadata_file            = optional(string)
    idp_signout              = optional(string, "false")
    encrypted_responses      = optional(string, "false")
    signing_algorithm        = optional(string, "rsa-sha256")
    email_attribute          = optional(string, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress")
    name_attribute           = optional(string, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name")
    username_attribute       = optional(string, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier")
    custom_attribute_mapping = optional(map(string), {})
    idp_identifiers          = optional(list(string), [])
    default_role             = optional(string, "VIEWER")
    enabled                  = optional(bool, true)
    display_name             = optional(string)
    logo_url                 = optional(string)
  }))
  description = "Map of SAML identity providers to configure"
  default     = {}
}

variable "oidc_providers" {
  type = map(object({
    client_id                 = string
    client_secret             = string
    issuer_url                = string
    authorize_scopes          = optional(string, "openid email profile")
    attributes_request_method = optional(string, "GET")
    authorize_url             = optional(string)
    token_url                 = optional(string)
    attributes_url            = optional(string)
    jwks_uri                  = optional(string)
    email_attribute           = optional(string, "email")
    name_attribute            = optional(string, "name")
    username_attribute        = optional(string, "sub")
    custom_attribute_mapping  = optional(map(string), {})
    idp_identifiers           = optional(list(string), [])
    default_role              = optional(string, "VIEWER")
    enabled                   = optional(bool, true)
    display_name              = optional(string)
    logo_url                  = optional(string)
  }))
  description = "Map of OIDC identity providers to configure"
  default     = {}
  sensitive   = true
}

variable "sso_callback_urls" {
  type        = list(string)
  description = "Allowed callback URLs for SSO authentication"
  default     = []
}

variable "sso_logout_urls" {
  type        = list(string)
  description = "Allowed logout URLs for SSO"
  default     = []
}

variable "create_sso_config_table" {
  type        = bool
  description = "Create DynamoDB table for SSO provider configuration"
  default     = true
}
