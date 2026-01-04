# Secrets Manager Module Outputs

#------------------------------------------------------------------------------
# Exchange Secret Outputs
#------------------------------------------------------------------------------
output "exchange_secret_arns" {
  description = "Map of exchange secret ARNs by exchange name"
  value = {
    for k, v in aws_secretsmanager_secret.exchange : k => v.arn
  }
}

output "exchange_secret_names" {
  description = "Map of exchange secret names by exchange name"
  value = {
    for k, v in aws_secretsmanager_secret.exchange : k => v.name
  }
}

output "exchange_secret_ids" {
  description = "Map of exchange secret IDs by exchange name"
  value = {
    for k, v in aws_secretsmanager_secret.exchange : k => v.id
  }
}

#------------------------------------------------------------------------------
# AI Provider Secret Outputs
#------------------------------------------------------------------------------
output "ai_provider_secret_arns" {
  description = "Map of AI provider secret ARNs by provider name"
  value = {
    for k, v in aws_secretsmanager_secret.ai_provider : k => v.arn
  }
}

output "ai_provider_secret_names" {
  description = "Map of AI provider secret names by provider name"
  value = {
    for k, v in aws_secretsmanager_secret.ai_provider : k => v.name
  }
}

output "ai_provider_secret_ids" {
  description = "Map of AI provider secret IDs by provider name"
  value = {
    for k, v in aws_secretsmanager_secret.ai_provider : k => v.id
  }
}

#------------------------------------------------------------------------------
# Infrastructure Secret Outputs
#------------------------------------------------------------------------------
output "infrastructure_secret_arns" {
  description = "Map of infrastructure secret ARNs by secret name"
  value = {
    for k, v in aws_secretsmanager_secret.infrastructure : k => v.arn
  }
}

output "infrastructure_secret_names" {
  description = "Map of infrastructure secret names by secret name"
  value = {
    for k, v in aws_secretsmanager_secret.infrastructure : k => v.name
  }
}

output "infrastructure_secret_ids" {
  description = "Map of infrastructure secret IDs by secret name"
  value = {
    for k, v in aws_secretsmanager_secret.infrastructure : k => v.id
  }
}

#------------------------------------------------------------------------------
# Aggregated Outputs
#------------------------------------------------------------------------------
output "all_secret_arns" {
  description = "List of all secret ARNs"
  value = concat(
    [for k, v in aws_secretsmanager_secret.exchange : v.arn],
    [for k, v in aws_secretsmanager_secret.ai_provider : v.arn],
    [for k, v in aws_secretsmanager_secret.infrastructure : v.arn]
  )
}

output "all_secret_names" {
  description = "List of all secret names"
  value = concat(
    [for k, v in aws_secretsmanager_secret.exchange : v.name],
    [for k, v in aws_secretsmanager_secret.ai_provider : v.name],
    [for k, v in aws_secretsmanager_secret.infrastructure : v.name]
  )
}

output "secrets_by_type" {
  description = "Map of secret ARNs grouped by type"
  value = {
    exchange       = { for k, v in aws_secretsmanager_secret.exchange : k => v.arn }
    ai_provider    = { for k, v in aws_secretsmanager_secret.ai_provider : k => v.arn }
    infrastructure = { for k, v in aws_secretsmanager_secret.infrastructure : k => v.arn }
  }
}

output "redis_secret_arn" {
  description = "ARN of the Redis connection secret"
  value       = aws_secretsmanager_secret.infrastructure["redis"].arn
}

output "redis_secret_name" {
  description = "Name of the Redis connection secret"
  value       = aws_secretsmanager_secret.infrastructure["redis"].name
}
