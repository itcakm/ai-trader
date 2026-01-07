# Lambda Module Outputs

#------------------------------------------------------------------------------
# Function ARNs
#------------------------------------------------------------------------------
output "function_arns" {
  description = "Map of Lambda function ARNs by function name"
  value = {
    for k, v in aws_lambda_function.functions : k => v.arn
  }
}

output "function_names" {
  description = "Map of Lambda function names by logical name"
  value = {
    for k, v in aws_lambda_function.functions : k => v.function_name
  }
}

output "function_invoke_arns" {
  description = "Map of Lambda function invoke ARNs by function name"
  value = {
    for k, v in aws_lambda_function.functions : k => v.invoke_arn
  }
}

output "function_qualified_arns" {
  description = "Map of Lambda function qualified ARNs by function name"
  value = {
    for k, v in aws_lambda_function.functions : k => v.qualified_arn
  }
}

#------------------------------------------------------------------------------
# Alias ARNs
#------------------------------------------------------------------------------
output "alias_arns" {
  description = "Map of Lambda alias ARNs by function name"
  value = {
    for k, v in aws_lambda_alias.live : k => v.arn
  }
}

output "alias_invoke_arns" {
  description = "Map of Lambda alias invoke ARNs by function name"
  value = {
    for k, v in aws_lambda_alias.live : k => v.invoke_arn
  }
}

#------------------------------------------------------------------------------
# Function Groups
#------------------------------------------------------------------------------
output "functions_by_group" {
  description = "Map of function names grouped by function group"
  value = {
    for group in distinct(values(local.function_groups)) : group => [
      for fn, grp in local.function_groups : aws_lambda_function.functions[fn].function_name 
      if grp == group && contains(keys(aws_lambda_function.functions), fn)
    ]
  }
}

output "function_arns_by_group" {
  description = "Map of function ARNs grouped by function group"
  value = {
    for group in distinct(values(local.function_groups)) : group => [
      for fn, grp in local.function_groups : aws_lambda_function.functions[fn].arn 
      if grp == group && contains(keys(aws_lambda_function.functions), fn)
    ]
  }
}

#------------------------------------------------------------------------------
# Individual Function Outputs (commonly accessed)
#------------------------------------------------------------------------------
output "kill_switch_function_arn" {
  description = "ARN of the kill-switch Lambda function"
  value       = aws_lambda_function.functions["kill-switch"].arn
}

output "kill_switch_function_name" {
  description = "Name of the kill-switch Lambda function"
  value       = aws_lambda_function.functions["kill-switch"].function_name
}

output "circuit_breakers_function_arn" {
  description = "ARN of the circuit-breakers Lambda function"
  value       = aws_lambda_function.functions["circuit-breakers"].arn
}

output "exchange_orders_function_arn" {
  description = "ARN of the exchange-orders Lambda function"
  value       = aws_lambda_function.functions["exchange-orders"].arn
}

#------------------------------------------------------------------------------
# Layer ARNs
#------------------------------------------------------------------------------
output "aws_sdk_layer_arn" {
  description = "ARN of the AWS SDK Lambda layer"
  value       = aws_lambda_layer_version.aws_sdk.arn
}

output "common_utils_layer_arn" {
  description = "ARN of the common utilities Lambda layer"
  value       = aws_lambda_layer_version.common_utils.arn
}

output "layer_arns" {
  description = "List of all Lambda layer ARNs"
  value = [
    aws_lambda_layer_version.aws_sdk.arn,
    aws_lambda_layer_version.common_utils.arn
  ]
}

#------------------------------------------------------------------------------
# CloudWatch Log Groups
#------------------------------------------------------------------------------
output "log_group_names" {
  description = "Map of CloudWatch log group names by function name"
  value = {
    for k, v in aws_cloudwatch_log_group.lambda : k => v.name
  }
}

output "log_group_arns" {
  description = "Map of CloudWatch log group ARNs by function name"
  value = {
    for k, v in aws_cloudwatch_log_group.lambda : k => v.arn
  }
}

#------------------------------------------------------------------------------
# Function Count
#------------------------------------------------------------------------------
output "function_count" {
  description = "Total number of Lambda functions created"
  value       = length(aws_lambda_function.functions)
}

#------------------------------------------------------------------------------
# All Function ARNs as List (for IAM policies)
#------------------------------------------------------------------------------
output "all_function_arns_list" {
  description = "List of all Lambda function ARNs"
  value       = [for k, v in aws_lambda_function.functions : v.arn]
}

#------------------------------------------------------------------------------
# Function Configuration Summary
#------------------------------------------------------------------------------
output "function_configurations" {
  description = "Summary of function configurations"
  value = {
    for k, v in aws_lambda_function.functions : k => {
      memory_size          = v.memory_size
      timeout              = v.timeout
      runtime              = v.runtime
      architecture         = v.architectures[0]
      reserved_concurrency = v.reserved_concurrent_executions
      tracing_mode         = v.tracing_config[0].mode
    }
  }
}

#------------------------------------------------------------------------------
# Auth Trigger Function Outputs
# Requirements: 1.8, 12.2, 12.3, 12.4
#------------------------------------------------------------------------------
output "auth_pre_signup_function_arn" {
  description = "ARN of the auth pre-signup Lambda trigger function"
  value       = contains(keys(aws_lambda_function.functions), "auth-pre-signup") ? aws_lambda_function.functions["auth-pre-signup"].arn : null
}

output "auth_post_confirmation_function_arn" {
  description = "ARN of the auth post-confirmation Lambda trigger function"
  value       = contains(keys(aws_lambda_function.functions), "auth-post-confirmation") ? aws_lambda_function.functions["auth-post-confirmation"].arn : null
}

output "auth_post_authentication_function_arn" {
  description = "ARN of the auth post-authentication Lambda trigger function"
  value       = contains(keys(aws_lambda_function.functions), "auth-post-authentication") ? aws_lambda_function.functions["auth-post-authentication"].arn : null
}

output "auth_trigger_function_arns" {
  description = "Map of auth trigger function ARNs (null values for excluded functions)"
  value = {
    pre_signup          = contains(keys(aws_lambda_function.functions), "auth-pre-signup") ? aws_lambda_function.functions["auth-pre-signup"].arn : null
    post_confirmation   = contains(keys(aws_lambda_function.functions), "auth-post-confirmation") ? aws_lambda_function.functions["auth-post-confirmation"].arn : null
    post_authentication = contains(keys(aws_lambda_function.functions), "auth-post-authentication") ? aws_lambda_function.functions["auth-post-authentication"].arn : null
  }
}
