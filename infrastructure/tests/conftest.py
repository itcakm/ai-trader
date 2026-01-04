"""
Pytest configuration and fixtures for infrastructure property tests.
"""
import os
import pytest
import hcl2
from pathlib import Path


def get_infrastructure_root():
    """Get the infrastructure root directory."""
    return Path(__file__).parent.parent


@pytest.fixture
def infrastructure_root():
    """Fixture providing the infrastructure root path."""
    return get_infrastructure_root()


@pytest.fixture
def test_tfvars(infrastructure_root):
    """Load test environment terraform.tfvars."""
    tfvars_path = infrastructure_root / "environments" / "test" / "terraform.tfvars"
    return load_tfvars(tfvars_path)


@pytest.fixture
def production_tfvars(infrastructure_root):
    """Load production environment terraform.tfvars."""
    tfvars_path = infrastructure_root / "environments" / "production" / "terraform.tfvars"
    return load_tfvars(tfvars_path)


def load_tfvars(path: Path) -> dict:
    """Load and parse a terraform.tfvars file."""
    if not path.exists():
        pytest.skip(f"tfvars file not found: {path}")
    
    with open(path, 'r') as f:
        content = f.read()
    
    # Parse HCL2 format
    try:
        parsed = hcl2.loads(content)
        # hcl2 returns lists for values, flatten single-item lists
        return {k: v[0] if isinstance(v, list) and len(v) == 1 else v 
                for k, v in parsed.items()}
    except Exception as e:
        pytest.fail(f"Failed to parse tfvars file {path}: {e}")


@pytest.fixture
def vpc_module_path(infrastructure_root):
    """Get the VPC module path."""
    return infrastructure_root / "modules" / "vpc"
