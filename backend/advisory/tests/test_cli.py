import unittest
import sys
import io
from unittest.mock import patch
import backend.advisory.cli as cli

class TestCLI(unittest.TestCase):

    @patch('sys.stdout', new_callable=io.StringIO)
    def test_cli_punjab_rabi_scenario(self, mock_stdout):
        # We simulate running: python cli.py --scenario punjab-rabi
        with patch.object(sys, 'argv', ['cli.py', '--scenario', 'punjab-rabi']):
            cli.main()
            output = mock_stdout.getvalue()
            
            self.assertIn("Krishi-Sahayak Advisory", output)
            self.assertIn("Status: SUCCESS", output)
            self.assertIn("Advisory confidence", output)
            self.assertIn("Top crop:", output)
            self.assertIn("Reasoning source:", output)
            self.assertIn("Deterministic Rule Engine", output)

    @patch('sys.stdout', new_callable=io.StringIO)
    def test_cli_nagpur_scenario(self, mock_stdout):
        with patch.object(sys, 'argv', ['cli.py', '--scenario', 'nagpur']):
            cli.main()
            output = mock_stdout.getvalue()
            
            self.assertIn("Status: SUCCESS", output)
            self.assertIn("Advisory confidence", output)

if __name__ == '__main__':
    unittest.main()
