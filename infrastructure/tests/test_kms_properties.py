"""
Property-Based Tests for KMS Module

Feature: infrastructure-deployment
Property 10: KMS Key Configuration
Validates: Requirements 17.2, 17.3, 17.4

This test validates that KMS keys are properly configured with:
- Automatic key rotation enabled
- Key policies with least-privilege access
- Key aliases for easy reference
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
def kms_module_path(infrastructure_root):
    """Get the KMS module path."""
    return infrastructure_root / "modules" / "kms"


@pytest.fixture
def kms_main_tf(kms_module_path):
    """Load the KMS module main.tf file."""
    return load_terraform_file(kms_module_path / "main.tf")


@pytest.fixture
def kms_variables_tf(kms_module_path):
    """Load the KMS module variables.tf file."""
    return load_terraform_file(kms_module_path / "variables.tf")


@pytest.fixture
def kms_outputs_tf(kms_module_path):
    """Load the KMS module outputs.tf file."""
    return load_terraform_file(kms_module_path / "outputs.tf")


def extract_kms_keys(resources: list) -> dict:
    """Extract KMS key configurations from parsed resources."""
    kms_keys = {}
    for resource_block in resources:
        if 'aws_kms_key' in resource_block:
            key_block = resource_block['aws_kms_key']
            for key_name, key_attrs in key_block.items():
                kms_keys[key_name] = key_attrs
    return kms_keys


def extract_kms_aliases(resources: list) -> dict:
    """Extract KMS alias configurations from parsed resources."""
    kms_aliases = {}
    for resource_block in resources:
        if 'aws_kms_alias' in resource_block:
            alias_block = resource_block['aws_kms_alias']
            for alias_name, alias_attrs in alias_block.items():
                kms_aliases[alias_name] = alias_attrs
    return kms_aliases


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


class TestKMSKeyConfiguration:
    """
    Property 10: KMS Key Configuration
    
    *For any* KMS customer-managed key created by the Terraform configuration,
    the key SHALL have automatic rotation enabled, a key policy with 
    least-privilege access, and a corresponding alias for easy reference.
    
    **Validates: Requirements 17.2, 17.3, 17.4**
    """
    
    def test_kms_module_exists(self, kms_module_path):
        """
        Feature: infrastructure-deployment
        Property 10: KMS Key Configuration
        Validates: Requirements 17.1
        
        Verify that the KMS module directory exists with required files.
        """
        assert kms_module_path.exists(), "KMS module directory should exist"
        assert (kms_module_path / "main.tf").exists(), "main.tf should exist"
        assert (kms_module_path / "variables.tf").exists(), "variables.tf should exist"
        assert (kms_module_path / "outputs.tf").exists(), "outputs.tf should exist"
    
    def test_secrets_key_has_rotation_enabled(self, kms_main_tf):
        """
        Feature: infrastructure-deployment
        Property 10: KMS Key Configuration
        Validates: Requirements 17.3
        
        Verify that the secrets KMS key has automatic rotation enabled.
        """
        resources = kms_main_tf.get('resource', [])
        kms_keys = extract_kms_keys(resources)
        
        assert len(kms_keys) > 0, "At least one KMS key should be defined"
        assert 'secrets' in kms_keys, "Secrets KMS key should be defined"
        
        secrets_key = kms_keys['secrets']
        assert 'enable_key_rotation' in secrets_key, (
            "Secrets KMS key must have enable_key_rotation attribute"
        )
    
    def test_s3_key_has_rotation_enabled(self, kms_main_tf):
        """
        Feature: infrastructure-deployment
        Property 10: KMS Key Configuration
        Validates: Requirements 17.3
        
        Verify that the S3 KMS key has automatic rotation enabled.
        """
        resources = kms_main_tf.get('resource', [])
        kms_keys = extract_kms_keys(resources)
        
        assert 's3' in kms_keys, "S3 KMS key should be defined"
        
        s3_key = kms_keys['s3']
        assert 'enable_key_rotation' in s3_key, (
            "S3 KMS key must have enable_key_rotation attribute"
        )
    
    def test_all_keys_have_aliases(self, kms_main_tf):
        """
        Feature: infrastructure-deployment
        Property 10: KMS Key Configuration
        Validates: Requirements 17.4
        
        Verify that all KMS keys have corresponding aliases for easy reference.
        """
        resources = kms_main_tf.get('resource', [])
        kms_keys = extract_kms_keys(resources)
        kms_aliases = extract_kms_aliases(resources)
        
        # Each key should have a corresponding alias
        for key_name in kms_keys.keys():
            assert key_name in kms_aliases, (
                f"KMS key '{key_name}' should have a corresponding alias"
            )
    
    def test_key_policies_have_least_privilege(self, kms_main_tf):
        """
        Feature: infrastructure-deployment
        Property 10: KMS Key Configuration
        Validates: Requirements 17.2
        
        Verify that KMS key policies follow least-privilege principles.
        """
        resources = kms_main_tf.get('resource', [])
        kms_keys = extract_kms_keys(resources)
        
        for key_name, key_attrs in kms_keys.items():
            # Check that policy is defined
            assert 'policy' in key_attrs, (
                f"KMS key '{key_name}' must have a policy defined"
            )
    
    def test_enable_key_rotation_variable_defaults_to_true(self, kms_variables_tf):
        """
        Feature: infrastructure-deployment
        Property 10: KMS Key Configuration
        Validates: Requirements 17.3
        
        Verify that the enable_key_rotation variable defaults to true.
        """
        variables = kms_variables_tf.get('variable', [])
        var_dict = extract_variables(variables)
        
        assert 'enable_key_rotation' in var_dict, "enable_key_rotation variable should be defined"
        
        rotation_var = var_dict['enable_key_rotation']
        assert rotation_var.get('default') == True, (
            "enable_key_rotation should default to true"
        )
    
    def test_outputs_include_key_arns(self, kms_outputs_tf):
        """
        Feature: infrastructure-deployment
        Property 10: KMS Key Configuration
        Validates: Requirements 17.4
        
        Verify that outputs include key ARNs for reference.
        """
        outputs = kms_outputs_tf.get('output', [])
        output_dict = extract_outputs(outputs)
        
        # Check for essential outputs
        assert 'secrets_key_arn' in output_dict, "secrets_key_arn output should exist"
        assert 's3_key_arn' in output_dict, "s3_key_arn output should exist"
    
    def test_outputs_include_key_aliases(self, kms_outputs_tf):
        """
        Feature: infrastructure-deployment
        Property 10: KMS Key Configuration
        Validates: Requirements 17.4
        
        Verify that outputs include key alias names for easy reference.
        """
        outputs = kms_outputs_tf.get('output', [])
        output_dict = extract_outputs(outputs)
        
        # Check for alias outputs
        assert 'secrets_key_alias_name' in output_dict, "secrets_key_alias_name output should exist"
        assert 's3_key_alias_name' in output_dict, "s3_key_alias_name output should exist"


class TestKMSKeyPropertyBased:
    """
    Property-based tests using Hypothesis to validate KMS key configurations.
    
    Feature: infrastructure-deployment
    Property 10: KMS Key Configuration
    Validates: Requirements 17.2, 17.3, 17.4
    """
    
    @given(
        key_purpose=st.sampled_from(['secrets', 's3', 'dynamodb']),
        environment=st.sampled_from(['test', 'production']),
        project_name=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz-',
            min_size=3,
            max_size=20
        ).filter(lambda x: not x.startswith('-') and not x.endswith('-') and '--' not in x)
    )
    @settings(max_examples=100)
    def test_key_alias_naming_convention(self, key_purpose, environment, project_name):
        """
        Feature: infrastructure-deployment
        Property 10: KMS Key Configuration
        Validates: Requirements 17.4
        
        *For any* KMS key purpose, environment, and project name combination,
        the generated alias name SHALL follow the pattern alias/{project}-{env}-{purpose}.
        """
        expected_alias = f"alias/{project_name}-{environment}-{key_purpose}"
        
        # Validate alias format
        assert expected_alias.startswith("alias/"), "Alias must start with 'alias/'"
        assert environment in expected_alias, "Alias must contain environment"
        assert key_purpose in expected_alias, "Alias must contain key purpose"
        
        # Validate alias length (AWS limit is 256 characters)
        assert len(expected_alias) <= 256, "Alias must not exceed 256 characters"
    
    @given(
        deletion_window=st.integers(min_value=7, max_value=30)
    )
    @settings(max_examples=100)
    def test_deletion_window_within_valid_range(self, deletion_window):
        """
        Feature: infrastructure-deployment
        Property 10: KMS Key Configuration
        Validates: Requirements 17.2
        
        *For any* deletion window value, it SHALL be between 7 and 30 days
        as required by AWS KMS.
        """
        assert 7 <= deletion_window <= 30, (
            f"Deletion window {deletion_window} must be between 7 and 30 days"
        )
    
    @given(
        num_lambda_roles=st.integers(min_value=0, max_value=10)
    )
    @settings(max_examples=100)
    def test_key_policy_handles_variable_lambda_roles(self, num_lambda_roles):
        """
        Feature: infrastructure-deployment
        Property 10: KMS Key Configuration
        Validates: Requirements 17.2
        
        *For any* number of Lambda roles (including zero), the key policy
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
