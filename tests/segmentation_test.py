import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'cli'))
from aboboo_cli.segmentation import segment,validate_boundaries


class SegmentationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(dir=os.environ.get('ABOBOO_TEST_TMP'))
        self.words=[dict(text=t,start=i,end=i+1) for i,t in enumerate(['Hello,','Anna.','How','are','you?'])]
    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp.name,ignore_errors=True);self.tmp.cleanup()
    def test_api_boundaries_preserve_words_and_times(self):
        with patch.dict(os.environ,{'DEEPSEEK_API_KEY':'test-secret'}),patch('aboboo_cli.segmentation.request',return_value=([2,5],{'total_tokens':10})) as req:
            a=segment({'words':self.words},self.tmp.name)
            b=segment({'words':self.words},self.tmp.name)
        self.assertEqual(req.call_count,1)
        self.assertEqual(a['segments'],b['segments'])
        self.assertEqual([s['text'] for s in a['segments']],['Hello, Anna.','How are you?'])
        self.assertEqual(a['segments'][1]['start'],2)
        self.assertEqual(a['segments'][1]['end'],5)
        self.assertEqual(a['words'],self.words)
    def test_missing_key_falls_back_without_api(self):
        with patch.dict(os.environ,{'DEEPSEEK_API_KEY':''}),patch('aboboo_cli.segmentation.request') as req:
            result=segment({'words':self.words},self.tmp.name)
        req.assert_not_called();self.assertTrue(result['warnings']);self.assertEqual(len(result['segments']),2)
    def test_failure_never_exposes_secret(self):
        with patch.dict(os.environ,{'DEEPSEEK_API_KEY':'test-secret'}),patch('aboboo_cli.segmentation.request',side_effect=RuntimeError('test-secret')):
            result=segment({'words':self.words},self.tmp.name)
        self.assertNotIn('test-secret',json.dumps(result));self.assertIn('回退',result['source'])
    def test_reject_invalid_boundaries(self):
        for value in [{'ends':[5,2]},{'ends':[2]},{'ends':[True,5]},{'ends':[0,5]},{'ends':[2,2,5]},{'ends':[6,5]},{'text':'rewritten'}]:
            with self.assertRaises(ValueError):validate_boundaries(value,5)
    def test_offline_mode_never_calls_api(self):
        with patch('aboboo_cli.segmentation.request') as req:
            result=segment({'words':self.words},self.tmp.name,provider='punctuation')
        req.assert_not_called();self.assertFalse(result['warnings'])

if __name__=='__main__':unittest.main()
