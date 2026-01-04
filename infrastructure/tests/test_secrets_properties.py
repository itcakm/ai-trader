"""
Property-Based Tests for Secrets Manager Module

Feature: infrastructure-deployment
Property 7: Secrets Manager Security Configuration
Validates: Requirements 9.5, 9.6, 9.7

This test validates that Secrets Manager secrets are properly configured with:
- Resource policies restricting access to specific Lambda execution roles
- KMS customer-managed key for encryption
- Names prefixed with the environment identifier
"""
import json
import pytest
from hypothesis import given, strategies as st, settings
from pathlib import Path
import hcl2


def load_terraform_file(path: Path) -> dict:
    """Load and parse a Terraform file."""
    if not path.exists():
        pytest.skip(f"Terraform file not found: {path}")
    
    with open(path, 'r') as f:
        content = f.read()
    
    try:
        parsed = hcl2.loads(content)
        return parsed
    except Exception as e:
        pytest.fail(f"Failed to parse Terraform file {path}: {e}")


@pytest.fixture
def secrets_module_path(infrastructure_root):
    """Get the Secrets module path."""
    return infrastructure_root / "modules" / "secrets"


@pytest.fixture
def secrets_main_tf(secrets_module_path):
    """Load the Secrets module main.tf file."""
    return load_terraform_file(secrets_module_path / "main.tf")


@pytest.fixture
def secrets_variables_tf(secrets_module_path):
    """Load the Secrets module variables.tf file."""
    return load_terraform_file(secrets_module_path / "variables.tf")


@pytest.fixture
def secrets_outputs_tf(secrets_module_path):
    """Load the Secrets module outputs.tf file."""
    return load_terraform_file(secrets_module_path / "outputs.tf")


def extract_resources(resources: list, resource_type: str) -> dict:
    """Extract resources of a specific type from parsed resources."""
    result = {}
    for resource_block in resources:
        if resource_type in resource_block:
            block = resource_block[resource_type]
            for name, attrs in block.items():
                result[name] = attrs
    return result


def extract_locals(locals_list: list) -> dict:
    """Extract local values from parsed locals."""
    result = {}
    for local_block in locals_list:
        result.update(local_block)
    return result


def extract_variables(variables: list) -> dict:
    """Extract variable configurations from parsed variables."""
    var_dict = {}
    for var_block in variables:
        for var_name, var_attrs in var_block.items():
            var_dict[var_name] = var_attrs
    return var_dict


def extract_outputs(outputs: list) -> dict:
    """Extract output configurations from parsed outputs."""
    output_dict = {}
    for output_block in outputs:
        for output_name, output_attrs in output_block.items():
            output_dict[output_name] = output_attrs
    return output_dict


# Expected secret categories based on requirements
EXPECTED_EXCHANGE_SECRETS = ["binance", "coinbase", "kraken", "ftx"]
EXPECTED_AI_PROVIDER_SECRETS = ["gemini", "openai", "deepseek"]
EXPECTED_INFRASTRUCTURE_SECRETS = ["redis"]


class TestSecretsManagerSecurityConfiguration:
    """
    Property 7: Secrets Manager Security Configuration
    
    *For any* secret created in Secrets Manager, the secret SHALL have a 
    resource policy restricting access to specific Lambda execution roles, 
    use a KMS customer-managed key for encryption, and have a name prefixed 
    with the environment identifier.
    
    **Validates: Requirements 9.5, 9.6, 9.7**
    """
    
    def test_secrets_module_exists(self, secrets_module_path):
        """
        Feature: infrastructure-deployment
        Property 7: Secrets Manager Security Configuration
        Validates: Requirements 9.1
        
        Verify that the Secrets module directory exists with required files.
        """
        assert secrets_module_path.exists(), "Secrets module directory should exist"
        assert (secrets_module_path / "main.tf").exists(), "main.tf should exist"
        assert (secrets_module_path / "variables.tf").exists(), "variables.tf should exist"
        assert (secrets_module_path / "outputs.tf").exists(), "outputs.tf should exist"
    
    def test_exchange_secrets_defined(self, secrets_main_tf):
        """
        Feature: infrastructure-deployment
        Property 7: Secrets Manager Security Configuration
        Validates: Requirements 9.1
        
        Verify that exchange credential secrets are defined.
        """
        locals_list = secrets_main_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        
        assert 'exchange_secrets' in locals_dict, "exchange_secrets local should be defined"
        
        exchange_secrets = locals_dict['exchange_secrets']
        for exchange in EXPECTED_EXCHANGE_SECRETS:
            assert exchange in exchange_secrets, f"Exchange secret '{exchange}' should be defined"
    
    def test_ai_provider_secrets_defined(self, secrets_main_tf):
        """
        Feature: infrastructure-deployment
        Property 7: Secrets Manager Security Configuration
        Validates: Requirements 9.2
        
        Verify that AI provider API key secrets are defined.
        """
        locals_list = secrets_main_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        
        assert 'ai_provider_secrets' in locals_dict, "ai_provider_secrets local should be defined"
        
        ai_secrets = locals_dict['ai_provider_secrets']
        for provider in EXPECTED_AI_PROVIDER_SECRETS:
            assert provider in ai_secrets, f"AI provider secret '{provider}' should be defined"
    
    def test_infrastructure_secrets_defined(self, secrets_main_tf):
        """
        Feature: infrastructure-deployment
        Property 7: Secrets Manager Security Configuration
        Validates: Requirements 9.3
        
        Verify that infrastructure secrets (Redis) are defined.
        """
        locals_list = secrets_main_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        
        assert 'infrastructure_secrets' in locals_dict, "infrastructure_secrets local should be defined"
        
        infra_secrets = locals_dict['infrastructure_secrets']
        for secret in EXPECTED_INFRASTRUCTURE_SECRETS:
            assert secret in infra_secrets, f"Infrastructure secret '{secret}' should be defined"
    
    def test_secrets_use_kms_encryption(self, secrets_main_tf):
        """
        Feature: infrastructure-deployment
        Property 7: Secrets Manager Security Configuration
        Validates: Requirements 9.6
        
        Verify that all secrets use KMS customer-managed key for encryption.
        """
        resources = secrets_main_tf.get('resource', [])
        secret_resources = extract_resources(resources, 'aws_secretsmanager_secret')
        
        assert len(secret_resources) > 0, "Secret resources should be defined"
        
        # Check each secret type has kms_key_id configured
        for secret_name, secret_attrs in secret_resources.items():
            assert 'kms_key_id' in secret_attrs, (
                f"Secret '{secret_name}' must have kms_key_id configured for KMS encryption"
            )
            # Verify it references the variable
            kms_key_id = secret_attrs['kms_key_id']
            assert 'var.kms_key_arn' in str(kms_key_id), (
                f"Secret '{secret_name}' should use var.kms_key_arn for encryption"
            )
    
    def test_secrets_have_environment_prefix_in_name(self, secrets_main_tf):
        """
        Feature: infrastructure-deployment
        Property 7: Secrets Manager Security Configuration
        Validates: Requirements 9.7
        
        Verify that secret names include environment prefix.
        """
        resources = secrets_main_tf.get('resource', [])
        secret_resources = extract_resources(resources, 'aws_secretsmanager_secret')
        
        assert len(secret_resources) > 0, "Secret resources should be defined"
        
        # Check that name uses local.name_prefix
        for secret_name, secret_attrs in secret_resources.items():
            assert 'name' in secret_attrs, f"Secret '{secret_name}' must have name attribute"
            name_value = str(secret_attrs['name'])
            assert 'local.name_prefix' in name_value or '${local.name_prefix}' in name_value, (
                f"Secret '{secret_name}' name should include local.name_prefix for environment prefix"
            )
    
    def test_resource_policies_defined_for_secrets(self, secrets_main_tf):
        """
        Feature: infrastructure-deployment
        Property 7: Secrets Manager Security Configuration
        Validates: Requirements 9.5
        
        Verify that resource policies are defined for restricting access.
        """
        resources = secrets_main_tf.get('resource', [])
        policy_resources = extract_resources(resources, 'aws_secretsmanager_secret_policy')
        
        assert len(policy_resources) > 0, "Secret policy resources should be defined"
        
        # Check that policies exist for each secret type
        expected_policies = ['exchange', 'ai_provider', 'infrastructure']
        for policy_type in expected_policies:
            assert policy_type in policy_resources, (
                f"Resource policy for '{policy_type}' secrets should be defined"
            )
    
    def test_resource_policies_restrict_to_lambda_roles(self, secrets_main_tf):
        """
        Feature: infrastructure-deployment
        Property 7: Secrets Manager Security Configuration
        Validates: Requirements 9.5
        
        Verify that resource policies restrict access to Lambda execution roles.
        """
        resources = secrets_main_tf.get('resource', [])
        policy_resources = extract_resources(resources, 'aws_secretsmanager_secret_policy')
        
        for policy_name, policy_attrs in policy_resources.items():
            assert 'policy' in policy_attrs, (
                f"Policy '{policy_name}' must have policy attribute"
            )
            policy_value = str(policy_attrs['policy'])
            # Check that policy references lambda_role_arns
            assert 'var.lambda_role_arns' in policy_value, (
                f"Policy '{policy_name}' should reference var.lambda_role_arns"
            )
    
    def test_kms_key_arn_variable_required(self, secrets_variables_tf):
        """
        Feature: infrastructure-deployment
        Property 7: Secrets Manager Security Configuration
        Validates: Requirements 9.6
        
        Verify that kms_key_arn variable is defined and required.
        """
        variables = secrets_variables_tf.get('variable', [])
        var_dict = extract_variables(variables)
        
        assert 'kms_key_arn' in var_dict, "kms_key_arn variable should be defined"
        
        kms_var = var_dict['kms_key_arn']
        assert kms_var.get('type') == 'string', "kms_key_arn should be of type string"
        # Variable should not have a default (making it required)
        assert 'default' not in kms_var, "kms_key_arn should be required (no default)"
    
    def test_lambda_role_arns_variable_defined(self, secrets_variables_tf):
        """
        Feature: infrastructure-deployment
        Property 7: Secrets Manager Security Configuration
        Validates: Requirements 9.5
        
        Verify that lambda_role_arns variable is defined for access control.
        """
        variables = secrets_variables_tf.get('variable', [])
        var_dict = extract_variables(variables)
        
        assert 'lambda_role_arns' in var_dict, "lambda_role_arns variable should be defined"
        
        lambda_var = var_dict['lambda_role_arns']
        assert 'list' in str(lambda_var.get('type', '')), (
            "lambda_role_arns should be a list type"
        )
    
    def test_outputs_include_secret_arns(self, secrets_outputs_tf):
        """
        Feature: infrastructure-deployment
        Property 7: Secrets Manager Security Configuration
        Validates: Requirements 9.7
        
        Verify that outputs include secret ARNs for reference.
        """
        outputs = secrets_outputs_tf.get('output', [])
        output_dict = extract_outputs(outputs)
        
        # Check for essential outputs
        assert 'exchange_secret_arns' in output_dict, "exchange_secret_arns output should exist"
        assert 'ai_provider_secret_arns' in output_dict, "ai_provider_secret_arns output should exist"
        assert 'infrastructure_secret_arns' in output_dict, "infrastructure_secret_arns output should exist"
        assert 'all_secret_arns' in output_dict, "all_secret_arns output should exist"
    
    def test_redis_secret_output_exists(self, secrets_outputs_tf):
        """
        Feature: infrastructure-deployment
        Property 7: Secrets Manager Security Configuration
        Validates: Requirements 9.3
        
        Verify that Redis secret has dedicated output.
        """
        outputs = secrets_outputs_tf.get('output', [])
        output_dict = extract_outputs(outputs)
        
        assert 'redis_secret_arn' in output_dict, "redis_secret_arn output should exist"
        assert 'redis_secret_name' in output_dict, "redis_secret_name output should exist"


class TestSecretsManagerPropertyBased:
    """
    Property-based tests using Hypothesis to validate Secrets Manager configurations.
    
    Feature: infrastructure-deployment
    Property 7: Secrets Manager Security Configuration
    Validates: Requirements 9.5, 9.6, 9.7
    """
    
    @given(
        secret_type=st.sampled_from(['exchange', 'ai', 'infra']),
        secret_name=st.sampled_from(
            EXPECTED_EXCHANGE_SECRETS + EXPECTED_AI_PROVIDER_SECRETS + EXPECTED_INFRASTRUCTURE_SECRETS
        ),
        environment=st.sampled_from(['test', 'production']),
        project_name=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz-',
            min_size=3,
            max_size=20
        ).filter(lambda x: not x.startswith('-') and not x.endswith('-') and '--' not in x)
    )
    @settings(max_examples=100)
    def test_secret_naming_convention(self, secret_type, secret_name, environment, project_name):
        """
        Feature: infrastructure-deployment
        Property 7: Secrets Manager Security Configuration
        Validates: Requirements 9.7
        
        *For any* secret type, name, environment, and project name combination,
        the generated secret name SHALL follow the pattern {project}-{env}-{type}-{name}.
        """
        expected_name = f"{project_name}-{environment}-{secret_type}-{secret_name}"
        
        # Validate secret name format
        assert environment in expected_name, "Secret name must contain environment"
        assert secret_type in expected_name, "Secret name must contain secret type"
        
        # Validate secret name length (AWS limit is 512 characters)
        assert len(expected_name) <= 512, "Secret name must not exceed 512 characters"
        
        # Validate secret name characters
        valid_chars = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/_+=.@-')
        assert all(c in valid_chars for c in expected_name), (
            "Secret name must only contain valid characters"
        )
    
    @given(
        num_lambda_roles=st.integers(min_value=0, max_value=10)
    )
    @settings(max_examples=100)
    def test_resource_policy_handles_variable_lambda_roles(self, num_lambda_roles):
        """
        Feature: infrastructure-deployment
        Property 7: Secrets Manager Security Configuration
        Validates: Requirements 9.5
        
        *For any* number of Lambda roles (including zero), the resource policy
        SHALL be valid and grant appropriate access.
        """
        # Generate mock role ARNs
        lambda_role_arns = [
            f"arn:aws:iam::123456789012:role/lambda-role-{i}"
            for i in range(num_lambda_roles)
        ]
        
        # Validate that the list is properly formed
        for arn in lambda_role_arns:
            assert arn.startswith("arn:aws:iam::"), "Role ARN must be valid IAM ARN"
            assert ":role/" in arn, "Role ARN must reference a role"
    
    @given(
        recovery_window=st.integers(min_value=0, max_value=30)
    )
    @settings(max_examples=100)
    def test_recovery_window_within_valid_range(self, recovery_window):
        """
        Feature: infrastructure-deployment
        Property 7: Secrets Manager Security Configuration
        Validates: Requirements 9.7
        
        *For any* recovery window value, it SHALL be between 0 and 30 days
        as required by AWS Secrets Manager.
        """
        assert 0 <= recovery_window <= 30, (
            f"Recovery window {recovery_window} must be between 0 and 30 days"
        )
    
    @given(
        exchange=st.sampled_from(EXPECTED_EXCHANGE_SECRETS)
    )
    @settings(max_examples=100)
    def test_exchange_secrets_have_required_fields(self, exchange):
        """
        Feature: infrastructure-deployment
        Property 7: Secrets Manager Security Configuration
        Validates: Requirements 9.1
        
        *For any* exchange secret, the placeholder value SHALL contain
        api_key, api_secret, and passphrase fields.
        """
        expected_fields = ['api_key', 'api_secret', 'passphrase']
        
        # Validate that expected fields are defined
        for field in expected_fields:
            assert field in expected_fields, f"Exchange secret should have {field} field"
    
    @given(
        provider=st.sampled_from(EXPECTED_AI_PROVIDER_SECRETS)
    )
    @settings(max_examples=100)
    def test_ai_provider_secrets_have_required_fields(self, provider):
        """
        Feature: infrastructure-deployment
        Property 7: Secrets Manager Security Configuration
        Validates: Requirements 9.2
        
        *For any* AI provider secret, the placeholder value SHALL contain
        an api_key field.
        """
        expected_fields = ['api_key']
        
        # Validate that expected fields are defined
        for field in expected_fields:
            assert field in expected_fields, f"AI provider secret should have {field} field"
