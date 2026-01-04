terraform {
  backend "s3" {
    # Note: bucket name will be "crypto-trading-terraform-state-{account_id}"
    # Replace with actual bucket name after running global/state-bucket
    bucket         = "crypto-trading-terraform-state-ACCOUNT_ID"
    key            = "environments/test/terraform.tfstate"
    region         = "eu-central-1"
    dynamodb_table = "crypto-trading-terraform-locks"
    encrypt        = true
  }
}
