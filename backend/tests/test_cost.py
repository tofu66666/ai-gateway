import pytest
from app.cost import calculate_cost

def test_calculate():
    cost=calculate_cost(1000,500,"0.1","0.4")
    assert cost.input_cost == pytest.approx(0.0001)
    assert cost.output_cost == pytest.approx(0.0002)
    assert cost.total == pytest.approx(0.0003)


