# KMS Module Outputs

#------------------------------------------------------------------------------
# Secrets Key Outputs
#------------------------------------------------------------------------------
output "secrets_key_id" {
  description = "The ID of the KMS key for Secrets Manager encryption"
  value       = var.enable_secrets_key ? aws_kms_key.secrets[0].key_id : null
}

output "secrets_key_arn" {
  description = "The ARN of the KMS key for Secrets Manager encryption"
  value       = var.enable_secrets_key ? aws_kms_key.secrets[0].arn : null
}

output "secrets_key_alias_arn" {
  description = "The ARN of the KMS key alias for Secrets Manager encryption"
  value       = var.enable_secrets_key ? aws_kms_alias.secrets[0].arn : null
}

output "secrets_key_alias_name" {
  description = "The name of the KMS key alias for Secrets Manager encryption"
  value       = var.enable_secrets_key ? aws_kms_alias.secrets[0].name : null
}

#------------------------------------------------------------------------------
# S3 Key Outputs
#------------------------------------------------------------------------------
output "s3_key_id" {
  description = "The ID of the KMS key for S3 encryption"
  value       = var.enable_s3_key ? aws_kms_key.s3[0].key_id : null
}

output "s3_key_arn" {
  description = "The ARN of the KMS key for S3 encryption"
  value       = var.enable_s3_key ? aws_kms_key.s3[0].arn : null
}

output "s3_key_alias_arn" {
  description = "The ARN of the KMS key alias for S3 encryption"
  value       = var.enable_s3_key ? aws_kms_alias.s3[0].arn : null
}

output "s3_key_alias_name" {
  description = "The name of the KMS key alias for S3 encryption"
  value       = var.enable_s3_key ? aws_kms_alias.s3[0].name : null
}

#------------------------------------------------------------------------------
# DynamoDB Key Outputs
#------------------------------------------------------------------------------
output "dynamodb_key_id" {
  description = "The ID of the KMS key for DynamoDB encryption"
  value       = var.enable_dynamodb_key ? aws_kms_key.dynamodb[0].key_id : null
}

output "dynamodb_key_arn" {
  description = "The ARN of the KMS key for DynamoDB encryption"
  value       = var.enable_dynamodb_key ? aws_kms_key.dynamodb[0].arn : null
}

output "dynamodb_key_alias_arn" {
  description = "The ARN of the KMS key alias for DynamoDB encryption"
  value       = var.enable_dynamodb_key ? aws_kms_alias.dynamodb[0].arn : null
}

output "dynamodb_key_alias_name" {
  description = "The name of the KMS key alias for DynamoDB encryption"
  value       = var.enable_dynamodb_key ? aws_kms_alias.dynamodb[0].name : null
}

#------------------------------------------------------------------------------
# Aggregated Outputs
#------------------------------------------------------------------------------
output "all_key_arns" {
  description = "Map of all KMS key ARNs by purpose"
  value = {
    secrets  = var.enable_secrets_key ? aws_kms_key.secrets[0].arn : null
    s3       = var.enable_s3_key ? aws_kms_key.s3[0].arn : null
    dynamodb = var.enable_dynamodb_key ? aws_kms_key.dynamodb[0].arn : null
  }
}

output "all_key_ids" {
  description = "Map of all KMS key IDs by purpose"
  value = {
    secrets  = var.enable_secrets_key ? aws_kms_key.secrets[0].key_id : null
    s3       = var.enable_s3_key ? aws_kms_key.s3[0].key_id : null
    dynamodb = var.enable_dynamodb_key ? aws_kms_key.dynamodb[0].key_id : null
  }
}

output "all_key_aliases" {
  description = "Map of all KMS key alias names by purpose"
  value = {
    secrets  = var.enable_secrets_key ? aws_kms_alias.secrets[0].name : null
    s3       = var.enable_s3_key ? aws_kms_alias.s3[0].name : null
    dynamodb = var.enable_dynamodb_key ? aws_kms_alias.dynamodb[0].name : null
  }
}
