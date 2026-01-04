environment = "production"
aws_region  = "eu-central-1"

# Networking
vpc_cidr           = "10.1.0.0/16"
availability_zones = ["eu-central-1a", "eu-central-1b", "eu-central-1c"]
single_nat_gateway = false

# Domain
domain_name     = "acinaces.com"
api_domain_name = "api.acinaces.com"

# DynamoDB
dynamodb_billing_mode = "PROVISIONED"
enable_autoscaling    = true

# Lambda
lambda_memory_default          = 512
lambda_timeout_default         = 30
enable_provisioned_concurrency = true

# Redis
redis_node_type               = "cache.t3.micro"
redis_num_cache_nodes         = 1
redis_multi_az                = false
redis_snapshot_retention_days = 7
redis_maintenance_window      = "sun:05:00-sun:07:00"
redis_snapshot_window         = "03:00-05:00"

# Timestream
timestream_memory_retention_hours  = 168
timestream_magnetic_retention_days = 365

# S3 Lifecycle
audit_log_retention_days = 2555

# CloudWatch
log_retention_days = 90

# Throttling
api_throttling_rate_limit  = 10000
api_throttling_burst_limit = 20000

# Budgets
monthly_budget_amount = 500

# Tags
owner       = "devops"
cost_center = "trading-platform-prod"
