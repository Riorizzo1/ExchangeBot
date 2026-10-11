import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import send_watch_alerts as app

NOW = 1791684000.0

def item(ident, seller='timecop702', title='VSF Seamaster Planet Ocean 42mm 600M'):
    return dict(id=ident, seller=seller, title=title, sourceGroup='reddit', price='USD 400', firstSeenAt='2026-10-10T18:02:59-04:00')

class Alerts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        for name in ['STATE', 'LATEST']:
            p = patch.object(app, name, self.root/name)
            p.start(); self.addCleanup(p.stop)
        app.save(app.STATE, {'current_ids': [], 'daily_ids': []})

    def run_scan(self, rows, ok=True, now=NOW):
        app.save(app.LATEST, {'currentItems': rows})
        with patch.object(app, 'rates', return_value={'USD': 1}), patch.object(app, 'pwa_listing_id', return_value='listing-test'), patch.object(app.time, 'time', return_value=now), patch.object(app, 'push', return_value=(ok, {})) as send, contextlib.redirect_stdout(io.StringIO()):
            app.main()
        return send.call_count, app.load(app.STATE, {})

    def test_crossposts_repeat_and_late(self):
        rows = [item(x) for x in ['1x2qsoh','1x2r52m','1x2r0k1']]
        n, state = self.run_scan(rows)
        self.assertEqual(n,1); self.assertEqual(len(state['current_ids']),3)
        self.assertEqual(self.run_scan(rows)[0],0)
        self.assertEqual(self.run_scan(rows+[item('later')])[0],0)

    def test_migration_does_not_replay(self):
        app.save(app.STATE, {'current_ids':['old'], 'daily_ids':[]})
        self.assertEqual(self.run_scan([item('old'),item('new')])[0],0)

    def test_distinct_sellers_and_models(self):
        self.assertEqual(self.run_scan([item('a'),item('b',seller='other'),item('c',title='Rolex Submariner 41mm')])[0],3)

    def test_failed_delivery_retries(self):
        n,state=self.run_scan([item('a')],ok=False)
        self.assertEqual(n,1); self.assertEqual(state['current_ids'],[])
        self.assertEqual(self.run_scan([item('a')])[0],1)

    def test_representative_and_posted_time_irrelevant(self):
        self.run_scan([item('a')])
        b=item('b'); b['postedAt']='2026-10-11T01:00:00Z'
        self.assertEqual(self.run_scan([b])[0],0)

    def test_relisting_after_window_not_old_replay(self):
        self.run_scan([item('a')])
        self.assertEqual(self.run_scan([item('a')],now=NOW+app.CROSSPOST_WINDOW+1)[0],0)
        self.assertEqual(self.run_scan([item('a'),item('b')],now=NOW+app.CROSSPOST_WINDOW+1)[0],1)

    def test_incomplete_identity_not_merged(self):
        self.assertEqual(self.run_scan([item('a',seller=''),item('b',seller='')])[0],2)

    def test_first_run_seeds_no_push(self):
        app.STATE.unlink()
        self.assertEqual(self.run_scan([item('a')])[0],0)
        self.assertEqual(self.run_scan([item('a'),item('b')])[0],0)

if __name__=='__main__': unittest.main()
