# S3 Module Outputs

#------------------------------------------------------------------------------
# Individual Bucket Outputs
#------------------------------------------------------------------------------
output "audit_logs_bucket_id" {
  description = "The ID of the audit-logs bucket"
  value       = aws_s3_bucket.buckets["audit-logs"].id
}

output "audit_logs_bucket_arn" {
  description = "The ARN of the audit-logs bucket"
  value       = aws_s3_bucket.buckets["audit-logs"].arn
}

output "prompt_templates_bucket_id" {
  description = "The ID of the prompt-templates bucket"
  value       = aws_s3_bucket.buckets["prompt-templates"].id
}

output "prompt_templates_bucket_arn" {
  description = "The ARN of the prompt-templates bucket"
  value       = aws_s3_bucket.buckets["prompt-templates"].arn
}

output "model_outputs_bucket_id" {
  description = "The ID of the model-outputs bucket"
  value       = aws_s3_bucket.buckets["model-outputs"].id
}

output "model_outputs_bucket_arn" {
  description = "The ARN of the model-outputs bucket"
  value       = aws_s3_bucket.buckets["model-outputs"].arn
}

output "frontend_assets_bucket_id" {
  description = "The ID of the frontend-assets bucket"
  value       = aws_s3_bucket.buckets["frontend-assets"].id
}

output "frontend_assets_bucket_arn" {
  description = "The ARN of the frontend-assets bucket"
  value       = aws_s3_bucket.buckets["frontend-assets"].arn
}

output "frontend_assets_bucket_domain_name" {
  description = "The bucket domain name for frontend-assets (for CloudFront origin)"
  value       = aws_s3_bucket.buckets["frontend-assets"].bucket_regional_domain_name
}

output "lambda_deployments_bucket_id" {
  description = "The ID of the lambda-deployments bucket"
  value       = aws_s3_bucket.buckets["lambda-deployments"].id
}

output "lambda_deployments_bucket_arn" {
  description = "The ARN of the lambda-deployments bucket"
  value       = aws_s3_bucket.buckets["lambda-deployments"].arn
}

#------------------------------------------------------------------------------
# Aggregated Outputs
#------------------------------------------------------------------------------
output "all_bucket_ids" {
  description = "Map of all bucket IDs by purpose"
  value = {
    for k, v in aws_s3_bucket.buckets : k => v.id
  }
}

output "all_bucket_arns" {
  description = "Map of all bucket ARNs by purpose"
  value = {
    for k, v in aws_s3_bucket.buckets : k => v.arn
  }
}

output "all_bucket_names" {
  description = "Map of all bucket names by purpose"
  value = {
    for k, v in aws_s3_bucket.buckets : k => v.bucket
  }
}

#------------------------------------------------------------------------------
# Backend Bucket ARNs (for IAM policies)
#------------------------------------------------------------------------------
output "backend_bucket_arns" {
  description = "List of backend bucket ARNs (excluding frontend-assets)"
  value = [
    aws_s3_bucket.buckets["audit-logs"].arn,
    aws_s3_bucket.buckets["prompt-templates"].arn,
    aws_s3_bucket.buckets["model-outputs"].arn,
    aws_s3_bucket.buckets["lambda-deployments"].arn
  ]
}
