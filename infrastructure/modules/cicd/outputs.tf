# CI/CD Module Outputs
# Exposes CI/CD resources for use by deployment pipelines
# Requirements: 21.4

#------------------------------------------------------------------------------
# GitHub Actions OIDC Provider Outputs
#------------------------------------------------------------------------------
output "github_oidc_provider_arn" {
  description = "ARN of the GitHub Actions OIDC provider"
  value       = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github_actions[0].arn : var.github_oidc_provider_arn
}

output "github_oidc_provider_url" {
  description = "URL of the GitHub Actions OIDC provider"
  value       = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github_actions[0].url : "https://token.actions.githubusercontent.com"
}

#------------------------------------------------------------------------------
# GitHub Actions IAM Role Outputs
#------------------------------------------------------------------------------
output "github_actions_role_arn" {
  description = "ARN of the GitHub Actions IAM role"
  value       = aws_iam_role.github_actions.arn
}

output "github_actions_role_name" {
  description = "Name of the GitHub Actions IAM role"
  value       = aws_iam_role.github_actions.name
}

#------------------------------------------------------------------------------
# CodePipeline IAM Role Outputs
#------------------------------------------------------------------------------
output "codepipeline_role_arn" {
  description = "ARN of the CodePipeline IAM role"
  value       = var.create_codepipeline_role ? aws_iam_role.codepipeline[0].arn : null
}

output "codepipeline_role_name" {
  description = "Name of the CodePipeline IAM role"
  value       = var.create_codepipeline_role ? aws_iam_role.codepipeline[0].name : null
}

#------------------------------------------------------------------------------
# ECR Repository Outputs
#------------------------------------------------------------------------------
output "ecr_repository_url" {
  description = "URL of the ECR repository"
  value       = var.create_ecr_repository ? aws_ecr_repository.main[0].repository_url : null
}

output "ecr_repository_arn" {
  description = "ARN of the ECR repository"
  value       = var.create_ecr_repository ? aws_ecr_repository.main[0].arn : null
}

output "ecr_repository_name" {
  description = "Name of the ECR repository"
  value       = var.create_ecr_repository ? aws_ecr_repository.main[0].name : null
}

output "ecr_registry_id" {
  description = "Registry ID of the ECR repository"
  value       = var.create_ecr_repository ? aws_ecr_repository.main[0].registry_id : null
}

#------------------------------------------------------------------------------
# CloudWatch Log Group Outputs
#------------------------------------------------------------------------------
output "cicd_log_group_name" {
  description = "Name of the main CI/CD CloudWatch log group"
  value       = aws_cloudwatch_log_group.cicd.name
}

output "cicd_log_group_arn" {
  description = "ARN of the main CI/CD CloudWatch log group"
  value       = aws_cloudwatch_log_group.cicd.arn
}

output "github_actions_log_group_name" {
  description = "Name of the GitHub Actions CloudWatch log group"
  value       = aws_cloudwatch_log_group.github_actions.name
}

output "github_actions_log_group_arn" {
  description = "ARN of the GitHub Actions CloudWatch log group"
  value       = aws_cloudwatch_log_group.github_actions.arn
}

output "codepipeline_log_group_name" {
  description = "Name of the CodePipeline CloudWatch log group"
  value       = var.create_codepipeline_role ? aws_cloudwatch_log_group.codepipeline[0].name : null
}

output "codepipeline_log_group_arn" {
  description = "ARN of the CodePipeline CloudWatch log group"
  value       = var.create_codepipeline_role ? aws_cloudwatch_log_group.codepipeline[0].arn : null
}

output "codebuild_log_group_name" {
  description = "Name of the CodeBuild CloudWatch log group"
  value       = var.create_codepipeline_role ? aws_cloudwatch_log_group.codebuild[0].name : null
}

output "codebuild_log_group_arn" {
  description = "ARN of the CodeBuild CloudWatch log group"
  value       = var.create_codepipeline_role ? aws_cloudwatch_log_group.codebuild[0].arn : null
}

#------------------------------------------------------------------------------
# All Log Group ARNs (for IAM policies)
#------------------------------------------------------------------------------
output "all_log_group_arns" {
  description = "List of all CI/CD CloudWatch log group ARNs"
  value = compact([
    aws_cloudwatch_log_group.cicd.arn,
    aws_cloudwatch_log_group.github_actions.arn,
    var.create_codepipeline_role ? aws_cloudwatch_log_group.codepipeline[0].arn : null,
    var.create_codepipeline_role ? aws_cloudwatch_log_group.codebuild[0].arn : null
  ])
}

#------------------------------------------------------------------------------
# Policy ARN Outputs
#------------------------------------------------------------------------------
output "github_actions_lambda_policy_arn" {
  description = "ARN of the GitHub Actions Lambda deployment policy"
  value       = aws_iam_policy.github_actions_lambda.arn
}

output "github_actions_frontend_policy_arn" {
  description = "ARN of the GitHub Actions frontend deployment policy"
  value       = aws_iam_policy.github_actions_frontend.arn
}

output "github_actions_ecr_policy_arn" {
  description = "ARN of the GitHub Actions ECR policy"
  value       = var.create_ecr_repository ? aws_iam_policy.github_actions_ecr[0].arn : null
}

output "github_actions_logs_policy_arn" {
  description = "ARN of the GitHub Actions CloudWatch Logs policy"
  value       = aws_iam_policy.github_actions_logs.arn
}


#------------------------------------------------------------------------------
# Summary Output for CI/CD Configuration
# Provides a single output with all essential CI/CD information
#------------------------------------------------------------------------------
output "cicd_configuration" {
  description = "Complete CI/CD configuration summary for deployment pipelines"
  value = {
    github_actions = {
      role_arn          = aws_iam_role.github_actions.arn
      role_name         = aws_iam_role.github_actions.name
      oidc_provider_arn = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github_actions[0].arn : var.github_oidc_provider_arn
    }
    codepipeline = var.create_codepipeline_role ? {
      role_arn  = aws_iam_role.codepipeline[0].arn
      role_name = aws_iam_role.codepipeline[0].name
    } : null
    ecr = var.create_ecr_repository ? {
      repository_url  = aws_ecr_repository.main[0].repository_url
      repository_arn  = aws_ecr_repository.main[0].arn
      repository_name = aws_ecr_repository.main[0].name
    } : null
    log_groups = {
      cicd           = aws_cloudwatch_log_group.cicd.name
      github_actions = aws_cloudwatch_log_group.github_actions.name
      codepipeline   = var.create_codepipeline_role ? aws_cloudwatch_log_group.codepipeline[0].name : null
      codebuild      = var.create_codepipeline_role ? aws_cloudwatch_log_group.codebuild[0].name : null
    }
  }
}
