# AWS Budgets Module Outputs

#------------------------------------------------------------------------------
# Main Budget Outputs
#------------------------------------------------------------------------------
output "monthly_budget_id" {
  description = "ID of the monthly budget"
  value       = aws_budgets_budget.monthly.id
}

output "monthly_budget_name" {
  description = "Name of the monthly budget"
  value       = aws_budgets_budget.monthly.name
}

output "monthly_budget_arn" {
  description = "ARN of the monthly budget"
  value       = aws_budgets_budget.monthly.arn
}

#------------------------------------------------------------------------------
# Service Budget Outputs
#------------------------------------------------------------------------------
output "lambda_budget_id" {
  description = "ID of the Lambda service budget"
  value       = var.create_service_budgets ? aws_budgets_budget.lambda[0].id : null
}

output "dynamodb_budget_id" {
  description = "ID of the DynamoDB service budget"
  value       = var.create_service_budgets ? aws_budgets_budget.dynamodb[0].id : null
}

output "api_gateway_budget_id" {
  description = "ID of the API Gateway service budget"
  value       = var.create_service_budgets ? aws_budgets_budget.api_gateway[0].id : null
}

#------------------------------------------------------------------------------
# Budget Configuration Summary
#------------------------------------------------------------------------------
output "budget_summary" {
  description = "Summary of budget configuration"
  value = {
    monthly_limit     = var.monthly_budget_amount
    currency          = var.budget_currency
    time_unit         = var.budget_time_unit
    alert_thresholds  = [var.alert_threshold_50, var.alert_threshold_80, var.alert_threshold_100]
    service_budgets   = var.create_service_budgets
  }
}

#------------------------------------------------------------------------------
# All Budget ARNs
#------------------------------------------------------------------------------
output "all_budget_arns" {
  description = "List of all budget ARNs"
  value = compact(concat(
    [aws_budgets_budget.monthly.arn],
    var.create_service_budgets ? [
      aws_budgets_budget.lambda[0].arn,
      aws_budgets_budget.dynamodb[0].arn,
      aws_budgets_budget.api_gateway[0].arn
    ] : []
  ))
}
