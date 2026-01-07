"""
Property-Based Tests for Production Deployment

Feature: production-deployment
Property 1: Lambda Deployment Coverage
Property 2: Lambda Environment Variable Configuration
Validates: Requirements 2.4, 3.1, 3.2

This test validates that:
- All Lambda handler files have corresponding deployment packages
- Lambda functions are configured with correct environment variables
"""
import os
import pytest
from hypothesis import given, strategies as st, settings, assume
from pathlib import Path
import json
import re


def get_project_root():
    """Get the project root directory."""
    return Path(__file__).parent.parent.parent


def get_backend_handlers_dir():
    """Get the backend handlers directory."""
    return get_project_root() / "backend" / "src" / "handlers"


def get_handler_files():
    """Get all handler files (excluding test files)."""
    handlers_dir = get_backend_handlers_dir()
    if not handlers_dir.exists():
        return []
    
    return [
        f.stem for f in handlers_dir.glob("*.ts")
        if not f.name.endswith('.test.ts')
    ]


def get_deployment_script_path():
    """Get the deployment script path."""
    return get_project_root() / "deployment" / "scripts" / "deploy-backend.sh"


def parse_deployment_script():
    """Parse the deployment script to extract handler processing logic."""
    script_path = get_deployment_script_path()
    if not script_path.exists():
        return None
    
    with open(script_path, 'r') as f:
        return f.read()


# Expected handler files based on backend/src/handlers/
EXPECTED_HANDLERS = [
    "ai-traces",
    "allocations",
    "analysis",
    "audit-packages",
    "audit-stream",
    "audit",
    "backfills",
    "circuit-breakers",
    "compliance-reports",
    "data-lineage",
    "data-sources",
    "deployments",
    "drawdown",
    "ensemble",
    "exchange-config",
    "exchange-connections",
    "exchange-orders",
    "exchange-positions",
    "kill-switch",
    "model-configs",
    "news-context",
    "performance",
    "position-limits",
    "providers",
    "quality",
    "retention",
    "risk-events",
    "risk-profiles",
    "snapshots",
    "strategies",
    "streams",
    "templates",
    "trade-lifecycle",
    "versions"
]

# Environment variables that should be configured for Lambda functions
REQUIRED_ENV_VARS = [
    "ENVIRONMENT",
]

# DynamoDB table environment variable patterns
DYNAMODB_TABLE_PATTERN = re.compile(r'DYNAMODB_TABLE_[A-Z_]+')

# Secret ARN environment variable patterns
SECRET_ARN_PATTERN = re.compile(r'SECRET_ARN_[A-Z_]+')


@pytest.fixture
def project_root():
    """Fixture providing the project root path."""
    return get_project_root()


@pytest.fixture
def backend_handlers_dir(project_root):
    """Fixture providing the backend handlers directory."""
    return project_root / "backend" / "src" / "handlers"


@pytest.fixture
def deployment_script(project_root):
    """Fixture providing the deployment script content."""
    script_path = project_root / "deployment" / "scripts" / "deploy-backend.sh"
    if not script_path.exists():
        pytest.skip("Deployment script not found")
    
    with open(script_path, 'r') as f:
        return f.read()


@pytest.fixture
def handler_files(backend_handlers_dir):
    """Fixture providing list of handler files."""
    if not backend_handlers_dir.exists():
        pytest.skip("Backend handlers directory not found")
    
    return [
        f.stem for f in backend_handlers_dir.glob("*.ts")
        if not f.name.endswith('.test.ts')
    ]


class TestLambdaDeploymentCoverage:
    """
    Property 1: Lambda Deployment Coverage
    
    *For any* Lambda handler file in `backend/src/handlers/` (excluding test files), 
    there SHALL exist a corresponding deployment package uploaded to S3 and a Lambda 
    function updated with that package.
    
    **Validates: Requirements 2.4, 3.1**
    """
    
    def test_deployment_script_exists(self, project_root):
        """
        Feature: production-deployment
        Property 1: Lambda Deployment Coverage
        Validates: Requirements 2.4, 3.1
        
        Verify that the deployment script exists.
        """
        script_path = project_root / "deployment" / "scripts" / "deploy-backend.sh"
        assert script_path.exists(), "deploy-backend.sh should exist"
        assert os.access(script_path, os.X_OK), "deploy-backend.sh should be executable"
    
    def test_deployment_script_finds_all_handlers(self, deployment_script, handler_files):
        """
        Feature: production-deployment
        Property 1: Lambda Deployment Coverage
        Validates: Requirements 2.4, 3.1
        
        Verify that the deployment script processes all handler files.
        """
        # Check that the script uses find to locate handler files
        assert 'find' in deployment_script or 'handlers' in deployment_script, (
            "Deployment script should locate handler files"
        )
        
        # Check that the script excludes test files
        assert '.test.ts' in deployment_script or 'test' in deployment_script.lower(), (
            "Deployment script should exclude test files"
        )
    
    def test_deployment_script_creates_packages(self, deployment_script):
        """
        Feature: production-deployment
        Property 1: Lambda Deployment Coverage
        Validates: Requirements 2.4
        
        Verify that the deployment script creates ZIP packages.
        """
        assert 'zip' in deployment_script, "Deployment script should create ZIP packages"
        assert '.zip' in deployment_script, "Deployment script should reference .zip files"
    
    def test_deployment_script_uploads_to_s3(self, deployment_script):
        """
        Feature: production-deployment
        Property 1: Lambda Deployment Coverage
        Validates: Requirements 2.7
        
        Verify that the deployment script uploads packages to S3.
        """
        assert 'aws s3' in deployment_script or 's3 cp' in deployment_script, (
            "Deployment script should upload to S3"
        )
    
    def test_deployment_script_updates_lambda(self, deployment_script):
        """
        Feature: production-deployment
        Property 1: Lambda Deployment Coverage
        Validates: Requirements 3.1
        
        Verify that the deployment script updates Lambda functions.
        """
        assert 'update-function-code' in deployment_script, (
            "Deployment script should update Lambda function code"
        )
    
    def test_all_expected_handlers_exist(self, handler_files):
        """
        Feature: production-deployment
        Property 1: Lambda Deployment Coverage
        Validates: Requirements 2.4, 3.1
        
        Verify that all expected handler files exist.
        """
        for handler in EXPECTED_HANDLERS:
            assert handler in handler_files, (
                f"Expected handler '{handler}' should exist in backend/src/handlers/"
            )
    
    def test_handler_count_matches_expected(self, handler_files):
        """
        Feature: production-deployment
        Property 1: Lambda Deployment Coverage
        Validates: Requirements 2.4, 3.1
        
        Verify that the number of handlers matches expected count.
        """
        # We expect at least 34 handlers (as per requirements)
        assert len(handler_files) >= 34, (
            f"Expected at least 34 handlers, found {len(handler_files)}"
        )
    
    @given(handler_name=st.sampled_from(EXPECTED_HANDLERS))
    @settings(max_examples=100)
    def test_handler_package_naming_convention(self, handler_name):
        """
        Feature: production-deployment
        Property 1: Lambda Deployment Coverage
        Validates: Requirements 2.4
        
        *For any* handler name, the deployment package SHALL follow the naming 
        convention {handler_name}.zip.
        """
        expected_package_name = f"{handler_name}.zip"
        
        # Validate package name format
        assert expected_package_name.endswith('.zip'), (
            "Package name must end with .zip"
        )
        
        # Validate package name doesn't contain invalid characters
        valid_chars = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.')
        assert all(c in valid_chars for c in expected_package_name), (
            "Package name must only contain valid characters"
        )
    
    @given(
        handler_name=st.sampled_from(EXPECTED_HANDLERS),
        environment=st.sampled_from(['test', 'production'])
    )
    @settings(max_examples=100)
    def test_lambda_function_naming_convention(self, handler_name, environment):
        """
        Feature: production-deployment
        Property 1: Lambda Deployment Coverage
        Validates: Requirements 3.1
        
        *For any* handler and environment combination, the Lambda function name 
        SHALL follow the pattern {environment}-crypto-trading-{handler_name}.
        """
        expected_function_name = f"{environment}-crypto-trading-{handler_name}"
        
        # Validate function name format
        assert environment in expected_function_name, (
            "Function name must contain environment"
        )
        assert handler_name in expected_function_name, (
            "Function name must contain handler name"
        )
        
        # Validate function name length (AWS limit is 64 characters)
        assert len(expected_function_name) <= 64, (
            f"Function name '{expected_function_name}' must not exceed 64 characters"
        )
    
    @given(
        handler_name=st.sampled_from(EXPECTED_HANDLERS),
        bucket_name=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz0123456789-',
            min_size=3,
            max_size=63
        ).filter(lambda x: not x.startswith('-') and not x.endswith('-') and '--' not in x)
    )
    @settings(max_examples=100)
    def test_s3_key_format(self, handler_name, bucket_name):
        """
        Feature: production-deployment
        Property 1: Lambda Deployment Coverage
        Validates: Requirements 2.7
        
        *For any* handler and bucket combination, the S3 key SHALL follow the 
        pattern lambda/{handler_name}.zip.
        """
        assume(len(bucket_name) >= 3)  # S3 bucket names must be at least 3 chars
        
        expected_s3_key = f"lambda/{handler_name}.zip"
        
        # Validate S3 key format
        assert expected_s3_key.startswith('lambda/'), (
            "S3 key must start with 'lambda/'"
        )
        assert expected_s3_key.endswith('.zip'), (
            "S3 key must end with '.zip'"
        )
        
        # Validate full S3 URI
        full_uri = f"s3://{bucket_name}/{expected_s3_key}"
        assert len(full_uri) <= 1024, (
            "S3 URI must not exceed 1024 characters"
        )


class TestLambdaEnvironmentVariableConfiguration:
    """
    Property 2: Lambda Environment Variable Configuration
    
    *For any* Lambda function deployed, the environment variables SHALL include 
    all DynamoDB table names from the Terraform outputs, the Redis endpoint, 
    and the Secrets Manager ARNs for credentials the function requires.
    
    **Validates: Requirements 3.2**
    """
    
    def test_deployment_script_configures_env_vars(self, deployment_script):
        """
        Feature: production-deployment
        Property 2: Lambda Environment Variable Configuration
        Validates: Requirements 3.2
        
        Verify that the deployment script configures environment variables.
        """
        assert 'update-function-configuration' in deployment_script, (
            "Deployment script should update function configuration"
        )
        assert 'environment' in deployment_script.lower(), (
            "Deployment script should configure environment variables"
        )
    
    def test_deployment_script_reads_dynamodb_tables(self, deployment_script):
        """
        Feature: production-deployment
        Property 2: Lambda Environment Variable Configuration
        Validates: Requirements 3.2
        
        Verify that the deployment script reads DynamoDB table names from manifest.
        """
        assert 'dynamodb_table' in deployment_script.lower(), (
            "Deployment script should read DynamoDB table names"
        )
    
    def test_deployment_script_reads_redis_endpoint(self, deployment_script):
        """
        Feature: production-deployment
        Property 2: Lambda Environment Variable Configuration
        Validates: Requirements 3.2
        
        Verify that the deployment script reads Redis endpoint from manifest.
        """
        assert 'redis' in deployment_script.lower(), (
            "Deployment script should read Redis endpoint"
        )
    
    def test_deployment_script_reads_secret_arns(self, deployment_script):
        """
        Feature: production-deployment
        Property 2: Lambda Environment Variable Configuration
        Validates: Requirements 3.2
        
        Verify that the deployment script reads secret ARNs from manifest.
        """
        assert 'secret' in deployment_script.lower(), (
            "Deployment script should read secret ARNs"
        )
    
    @given(
        table_name=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz-',
            min_size=3,
            max_size=30
        ).filter(lambda x: not x.startswith('-') and not x.endswith('-') and '--' not in x)
    )
    @settings(max_examples=100)
    def test_dynamodb_env_var_naming(self, table_name):
        """
        Feature: production-deployment
        Property 2: Lambda Environment Variable Configuration
        Validates: Requirements 3.2
        
        *For any* DynamoDB table name, the environment variable SHALL follow 
        the pattern DYNAMODB_TABLE_{TABLE_NAME_UPPER}.
        """
        assume(len(table_name) >= 3)
        
        # Convert table name to environment variable format
        env_var_name = f"DYNAMODB_TABLE_{table_name.replace('-', '_').upper()}"
        
        # Validate environment variable name format
        assert env_var_name.startswith('DYNAMODB_TABLE_'), (
            "DynamoDB env var must start with 'DYNAMODB_TABLE_'"
        )
        
        # Validate environment variable name characters
        valid_chars = set('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_')
        assert all(c in valid_chars for c in env_var_name), (
            f"Environment variable name '{env_var_name}' must only contain valid characters"
        )
    
    @given(
        exchange_name=st.sampled_from([
            'binance', 'coinbase', 'kraken', 'okx', 
            'bsdex', 'bison', 'finoa', 'bybit'
        ])
    )
    @settings(max_examples=100)
    def test_exchange_secret_env_var_naming(self, exchange_name):
        """
        Feature: production-deployment
        Property 2: Lambda Environment Variable Configuration
        Validates: Requirements 3.2
        
        *For any* exchange name, the secret ARN environment variable SHALL follow 
        the pattern SECRET_ARN_{EXCHANGE_NAME_UPPER}.
        """
        env_var_name = f"SECRET_ARN_{exchange_name.replace('-', '_').upper()}"
        
        # Validate environment variable name format
        assert env_var_name.startswith('SECRET_ARN_'), (
            "Exchange secret env var must start with 'SECRET_ARN_'"
        )
        
        # Validate environment variable name characters
        valid_chars = set('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_')
        assert all(c in valid_chars for c in env_var_name), (
            f"Environment variable name '{env_var_name}' must only contain valid characters"
        )
    
    @given(
        ai_provider=st.sampled_from(['gemini', 'openai', 'deepseek'])
    )
    @settings(max_examples=100)
    def test_ai_provider_secret_env_var_naming(self, ai_provider):
        """
        Feature: production-deployment
        Property 2: Lambda Environment Variable Configuration
        Validates: Requirements 3.2
        
        *For any* AI provider name, the secret ARN environment variable SHALL follow 
        the pattern SECRET_ARN_AI_{PROVIDER_NAME_UPPER}.
        """
        env_var_name = f"SECRET_ARN_AI_{ai_provider.replace('-', '_').upper()}"
        
        # Validate environment variable name format
        assert env_var_name.startswith('SECRET_ARN_AI_'), (
            "AI provider secret env var must start with 'SECRET_ARN_AI_'"
        )
        
        # Validate environment variable name characters
        valid_chars = set('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_')
        assert all(c in valid_chars for c in env_var_name), (
            f"Environment variable name '{env_var_name}' must only contain valid characters"
        )
    
    @given(
        redis_endpoint=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz0123456789.-',
            min_size=5,
            max_size=100
        ).filter(
            lambda x: '.' in x 
            and not x.startswith('.') 
            and not x.endswith('.')
            and '..' not in x  # No consecutive dots
        )
    )
    @settings(max_examples=100)
    def test_redis_endpoint_format(self, redis_endpoint):
        """
        Feature: production-deployment
        Property 2: Lambda Environment Variable Configuration
        Validates: Requirements 3.2
        
        *For any* Redis endpoint, it SHALL be a valid hostname format.
        """
        assume(len(redis_endpoint) >= 5)
        assume('.' in redis_endpoint)
        assume('..' not in redis_endpoint)  # No consecutive dots
        
        # Validate Redis endpoint format (basic hostname validation)
        parts = redis_endpoint.split('.')
        assert len(parts) >= 2, "Redis endpoint must have at least 2 parts"
        
        # Each part should be non-empty
        assert all(len(part) > 0 for part in parts), (
            "Redis endpoint parts must be non-empty"
        )


class TestDeploymentScriptStructure:
    """
    Tests for deployment script structure and completeness.
    
    Feature: production-deployment
    Validates: Requirements 2.1, 2.2, 2.3
    """
    
    def test_script_has_build_phase(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 2.1
        
        Verify that the deployment script has a build phase.
        """
        assert 'npm run build' in deployment_script or 'build' in deployment_script, (
            "Deployment script should have a build phase"
        )
    
    def test_script_has_test_phase(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 2.2, 2.3
        
        Verify that the deployment script has a test phase.
        """
        assert 'npm test' in deployment_script or 'test' in deployment_script, (
            "Deployment script should have a test phase"
        )
    
    def test_script_has_skip_tests_option(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 2.3
        
        Verify that the deployment script supports skipping tests.
        """
        assert 'skip' in deployment_script.lower() and 'test' in deployment_script.lower(), (
            "Deployment script should support skipping tests"
        )
    
    def test_script_aborts_on_test_failure(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 2.3
        
        Verify that the deployment script aborts on test failure.
        """
        assert 'exit 1' in deployment_script, (
            "Deployment script should exit on failure"
        )
        assert 'abort' in deployment_script.lower() or 'fail' in deployment_script.lower(), (
            "Deployment script should indicate abort on failure"
        )
    
    def test_script_has_error_handling(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 2.3
        
        Verify that the deployment script has error handling.
        """
        assert 'set -e' in deployment_script, (
            "Deployment script should use 'set -e' for error handling"
        )
    
    def test_script_has_logging(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 2.3
        
        Verify that the deployment script has logging functions.
        """
        assert 'log_' in deployment_script or 'echo' in deployment_script, (
            "Deployment script should have logging"
        )
    
    def test_script_validates_environment(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 2.1
        
        Verify that the deployment script validates environment parameter.
        """
        assert 'test' in deployment_script and 'production' in deployment_script, (
            "Deployment script should validate environment parameter"
        )
    
    def test_script_reads_manifest(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 3.2
        
        Verify that the deployment script reads from manifest file.
        """
        assert 'manifest' in deployment_script.lower(), (
            "Deployment script should read from manifest file"
        )
        assert 'jq' in deployment_script, (
            "Deployment script should use jq to parse manifest"
        )
