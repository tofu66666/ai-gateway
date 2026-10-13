# This cost.py is to use for more complex caculations.
# At the moment, it only:
# 1. Calculate the cost using table from tokens.
# 2. Calculate price_per_1m_input and price_per_1m_output
# Perhaps later, include check function to filter wrong tokens and prices.

from typing import NamedTuple
# Using NamedTuple to facilitate visualization of variables

ONE_M=float(1000000) # One Million

class Cost(NamedTuple):
    #Input and output coset in USD, not rounded.
    #USD because the price table is in USD

    input_cost: float
    output_cost: float

    @property
    def total(self) -> float:
        return self.input_cost+self.output_cost

def calculate_cost(
    input_tokens: int, 
    output_tokens: int, 
    price_per_1m_input: float,
    price_per_1m_output: float,
) -> Cost:

    #Calculate request cost in USD
    price_in=float(price_per_1m_input)
    price_out=float(price_per_1m_output)
    
    return Cost(
        input_cost=input_tokens*price_in / ONE_M,
        output_cost=output_tokens*price_out / ONE_M,
    )




