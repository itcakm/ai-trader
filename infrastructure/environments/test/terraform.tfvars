environment = "test"
aws_region  = "eu-central-1"

# Networking
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["eu-central-1a", "eu-central-1b"]
single_nat_gateway = true

# Domain
domain_name     = "test.acinaces.com"
api_domain_name = "api.test.acinaces.com"

# DynamoDB
dynamodb_billing_mode = "PAY_PER_REQUEST"
enable_autoscaling    = false

# Lambda
lambda_memory_default          = 256
lambda_timeout_default         = 30
enable_provisioned_concurrency = false

# Redis
redis_node_type               = "cache.t3.micro"
redis_num_cache_nodes         = 1
redis_multi_az                = false
redis_snapshot_retention_days = 0
redis_maintenance_window      = "sun:05:00-sun:07:00"
redis_snapshot_window         = "03:00-05:00"

# Timestream
timestream_memory_retention_hours  = 24
timestream_magnetic_retention_days = 30

# S3 Lifecycle
audit_log_retention_days = 90

# CloudWatch
log_retention_days = 30

# Throttling
api_throttling_rate_limit  = 1000
api_throttling_burst_limit = 2000

# Budgets
monthly_budget_amount = 500

# Tags
owner       = "devops"
cost_center = "trading-platform-test"
