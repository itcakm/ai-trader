# Step Functions Module - State Machine Definitions
# Defines the local variables for state machine configuration

locals {
  # State machine definitions for log group creation
  state_machines = {
    trade-lifecycle = {
      description = "Trade Lifecycle Workflow - Orchestrates trade execution from signal to completion"
    }
    audit-package = {
      description = "Audit Package Generation Workflow - Generates comprehensive audit packages"
    }
    data-backfill = {
      description = "Data Backfill Workflow - Orchestrates historical data backfill processes"
    }
  }
}
