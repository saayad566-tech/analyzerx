import unittest

from quant_scores import BeneishYear, PiotroskiYear, beneish_m_score, piotroski_f_score, sloan_ratio


class QuantScoreTests(unittest.TestCase):
    def test_piotroski_all_positive_signals(self):
        prior = PiotroskiYear(10, 12, 100, 30, 40, 30, 10, 0.40, 0.70)
        current = PiotroskiYear(15, 20, 110, 25, 50, 30, 10, 0.45, 0.85)
        result = piotroski_f_score(current, prior)
        self.assertEqual(result.score, 9)
        self.assertTrue(all(value == 1 for value in result.signals.values()))

    def test_beneish_returns_all_variables_and_threshold_flag(self):
        prior = BeneishYear(100, 20, 50, 40, 5, 120, 30, 50, 8, 10, 15, 40)
        current = BeneishYear(120, 30, 60, 42, 5, 140, 35, 60, 9, 7, 18, 42)
        result = beneish_m_score(current, prior)
        self.assertEqual(set(result.variables), {"DSRI", "GMI", "AQI", "SGI", "DEPI", "SGAI", "LVGI", "TATA"})
        self.assertAlmostEqual(result.variables["SGI"], 1.2)
        self.assertIsInstance(result.high_risk, bool)

    def test_sloan_ratio_is_accruals_over_assets(self):
        self.assertAlmostEqual(sloan_ratio(120, 90, 1000), 0.03)

    def test_invalid_denominator_is_rejected(self):
        with self.assertRaises(ValueError):
            sloan_ratio(1, 1, 0)


if __name__ == "__main__":
    unittest.main()
