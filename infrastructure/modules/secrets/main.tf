# Secrets Manager Module - Secure Credential Storage
# Creates secrets for exchange credentials, AI provider API keys, and Redis connection

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  })

  # Exchange credential secrets
  exchange_secrets = {
    binance = {
      description = "Binance exchange API credentials"
      secret_type = "exchange"
    }
    coinbase = {
      description = "Coinbase exchange API credentials"
      secret_type = "exchange"
    }
    kraken = {
      description = "Kraken exchange API credentials"
      secret_type = "exchange"
    }
    ftx = {
      description = "FTX exchange API credentials"
      secret_type = "exchange"
    }
  }

  # AI provider API key secrets
  ai_provider_secrets = {
    gemini = {
      description = "Google Gemini AI API key"
      secret_type = "ai-provider"
    }
    openai = {
      description = "OpenAI API key"
      secret_type = "ai-provider"
    }
    deepseek = {
      description = "DeepSeek AI API key"
      secret_type = "ai-provider"
    }
  }

  # Infrastructure secrets
  infrastructure_secrets = {
    redis = {
      description = "Redis connection string"
      secret_type = "infrastructure"
    }
  }

  # Combine all secrets
  all_secrets = merge(
    local.exchange_secrets,
    local.ai_provider_secrets,
    local.infrastructure_secrets
  )
}

# Get current AWS account ID
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}


#------------------------------------------------------------------------------
# Exchange Credential Secrets
#------------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "exchange" {
  for_each = local.exchange_secrets

  name        = "${local.name_prefix}-exchange-${each.key}"
  description = each.value.description
  kms_key_id  = var.kms_key_arn

  recovery_window_in_days = var.recovery_window_in_days

  tags = merge(local.common_tags, {
    Name       = "${local.name_prefix}-exchange-${each.key}"
    SecretType = each.value.secret_type
    Exchange   = each.key
  })
}

# Placeholder secret values for exchange credentials
resource "aws_secretsmanager_secret_version" "exchange" {
  for_each = local.exchange_secrets

  secret_id = aws_secretsmanager_secret.exchange[each.key].id
  secret_string = jsonencode({
    api_key    = "PLACEHOLDER_API_KEY"
    api_secret = "PLACEHOLDER_API_SECRET"
    passphrase = "PLACEHOLDER_PASSPHRASE"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

#------------------------------------------------------------------------------
# AI Provider API Key Secrets
#------------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "ai_provider" {
  for_each = local.ai_provider_secrets

  name        = "${local.name_prefix}-ai-${each.key}"
  description = each.value.description
  kms_key_id  = var.kms_key_arn

  recovery_window_in_days = var.recovery_window_in_days

  tags = merge(local.common_tags, {
    Name       = "${local.name_prefix}-ai-${each.key}"
    SecretType = each.value.secret_type
    Provider   = each.key
  })
}

# Placeholder secret values for AI provider API keys
resource "aws_secretsmanager_secret_version" "ai_provider" {
  for_each = local.ai_provider_secrets

  secret_id = aws_secretsmanager_secret.ai_provider[each.key].id
  secret_string = jsonencode({
    api_key = "PLACEHOLDER_API_KEY"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

#------------------------------------------------------------------------------
# Infrastructure Secrets (Redis)
#------------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "infrastructure" {
  for_each = local.infrastructure_secrets

  name        = "${local.name_prefix}-infra-${each.key}"
  description = each.value.description
  kms_key_id  = var.kms_key_arn

  recovery_window_in_days = var.recovery_window_in_days

  tags = merge(local.common_tags, {
    Name       = "${local.name_prefix}-infra-${each.key}"
    SecretType = each.value.secret_type
  })
}

# Placeholder secret values for infrastructure secrets
resource "aws_secretsmanager_secret_version" "infrastructure" {
  for_each = local.infrastructure_secrets

  secret_id = aws_secretsmanager_secret.infrastructure[each.key].id
  secret_string = jsonencode({
    connection_string = "PLACEHOLDER_CONNECTION_STRING"
    host              = "PLACEHOLDER_HOST"
    port              = 6379
    auth_token        = "PLACEHOLDER_AUTH_TOKEN"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}


#------------------------------------------------------------------------------
# Secret Rotation Configuration (Optional)
#------------------------------------------------------------------------------

# Rotation for exchange secrets (when enabled)
resource "aws_secretsmanager_secret_rotation" "exchange" {
  for_each = var.enable_rotation && var.rotation_lambda_arn != "" ? local.exchange_secrets : {}

  secret_id           = aws_secretsmanager_secret.exchange[each.key].id
  rotation_lambda_arn = var.rotation_lambda_arn

  rotation_rules {
    automatically_after_days = var.rotation_days
  }
}

# Rotation for AI provider secrets (when enabled)
resource "aws_secretsmanager_secret_rotation" "ai_provider" {
  for_each = var.enable_rotation && var.rotation_lambda_arn != "" ? local.ai_provider_secrets : {}

  secret_id           = aws_secretsmanager_secret.ai_provider[each.key].id
  rotation_lambda_arn = var.rotation_lambda_arn

  rotation_rules {
    automatically_after_days = var.rotation_days
  }
}

#------------------------------------------------------------------------------
# Resource Policies - Restrict Access to Specific Lambda Roles
#------------------------------------------------------------------------------

# Resource policy for exchange secrets
resource "aws_secretsmanager_secret_policy" "exchange" {
  for_each = length(var.lambda_role_arns) > 0 ? local.exchange_secrets : {}

  secret_arn = aws_secretsmanager_secret.exchange[each.key].arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowLambdaAccess"
        Effect = "Allow"
        Principal = {
          AWS = var.lambda_role_arns
        }
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = aws_secretsmanager_secret.exchange[each.key].arn
      }
    ]
  })

  depends_on = [aws_secretsmanager_secret_version.exchange]
}

# Resource policy for AI provider secrets
resource "aws_secretsmanager_secret_policy" "ai_provider" {
  for_each = length(var.lambda_role_arns) > 0 ? local.ai_provider_secrets : {}

  secret_arn = aws_secretsmanager_secret.ai_provider[each.key].arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowLambdaAccess"
        Effect = "Allow"
        Principal = {
          AWS = var.lambda_role_arns
        }
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = aws_secretsmanager_secret.ai_provider[each.key].arn
      }
    ]
  })

  depends_on = [aws_secretsmanager_secret_version.ai_provider]
}

# Resource policy for infrastructure secrets
resource "aws_secretsmanager_secret_policy" "infrastructure" {
  for_each = length(var.lambda_role_arns) > 0 ? local.infrastructure_secrets : {}

  secret_arn = aws_secretsmanager_secret.infrastructure[each.key].arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowLambdaAccess"
        Effect = "Allow"
        Principal = {
          AWS = var.lambda_role_arns
        }
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = aws_secretsmanager_secret.infrastructure[each.key].arn
      }
    ]
  })

  depends_on = [aws_secretsmanager_secret_version.infrastructure]
}
