"""
Load a calculator build (src/lib/gb/calculators/*.json) into the live rate tables.

    python scripts/gb-calculators/load.py            # dry run: what would change, nothing written
    python scripts/gb-calculators/load.py --apply    # back up, then replace

Replaces gb_rates and gb_plans for each table, and sets its rules to the ones read from the
calculator with rules_status 'approved'. The previous rows are written to
~/trs-dn-migration/backups/ first, so the load can be reversed by reinserting them.
Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment.
"""
import json, os, subprocess, sys, datetime

APPLY = '--apply' in sys.argv
HERE = os.path.dirname(os.path.abspath(__file__))
CALC = os.path.normpath(os.path.join(HERE, '..', '..', 'src', 'lib', 'gb', 'calculators'))
BACKUP = os.path.expanduser('~/trs-dn-migration/backups')
SB = os.environ['NEXT_PUBLIC_SUPABASE_URL'] + '/rest/v1'
K = os.environ['SUPABASE_SERVICE_KEY']

# Insurer labels -> canonical products. Mirrors resolveProduct(); pinned in gb-resolve.test.ts.
CANON = {
    'Group Hospital & Surgical (GHS)': ['GHS'], 'Group Hospital and Surgical (GHS)': ['GHS'],
    'Group Outpatient GP (GP)': ['GOPC'], 'Group Outpatient Primary Care (GOPC)': ['GOPC'],
    'Group Outpatient Specialist (SP)': ['GOSC'], 'Group Outpatient Specialist Care (GOSC)': ['GOSC'],
    'Group Dental (GD)': ['GD'], 'Group Personal Accident (GPA)': ['GPA'],
    'Group Term Life (GTL)': ['GTL'], 'Group Critical Illness (Accelerated) (GCI)': ['GCI'],
}


def call(method, path, body=None, prefer=None):
    args = ['curl', '-s', '-X', method, f'{SB}/{path}', '-H', f'apikey: {K}', '-H', f'Authorization: Bearer {K}',
            '-H', 'Content-Type: application/json', '-w', '\n%{http_code}']
    if prefer: args += ['-H', f'Prefer: {prefer}']
    if body is not None:
        tmp = '/tmp/_gbload.json'
        with open(tmp, 'w') as f: json.dump(body, f)
        args += ['--data-binary', f'@{tmp}']
    out = subprocess.run(args, capture_output=True, text=True).stdout
    text, _, code = out.rpartition('\n')
    if not code.startswith('2'):
        sys.exit(f'{method} {path} -> {code}: {text[:400]}')
    return json.loads(text) if text.strip() else None


def main():
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    for name in sorted(os.listdir(CALC)):
        if not name.endswith('.json'): continue
        d = json.load(open(os.path.join(CALC, name)))
        tid = d['rate_table_id']
        table = call('GET', f'gb_rate_tables?id=eq.{tid}&select=id,insurer_id,insurer_name,effective_date,product_code,rules,rules_status')[0]
        old_rates = call('GET', f'gb_rates?rate_table_id=eq.{tid}&select=*&limit=5000')
        old_plans = call('GET', f'gb_plans?rate_table_id=eq.{tid}&select=*&limit=2000')

        products = []
        for r in d['rates']:
            if r['product_code'] not in products: products.append(r['product_code'])
        missing = [p for p in products if p not in CANON]
        if missing: sys.exit(f'No canonical mapping for {missing}')

        # What changes for the rows a broker could already quote on: same product, same base plan,
        # same age band, the calculator's default variant.
        def key(r): return (r['product_code'], r['plan_code'].split(' · ')[0], r['age_min'])
        new_default = {key(r): r for r in d['rates']
                       if ' · ' not in r['plan_code'] or r['plan_code'].endswith('Private 1-bedded')}
        moved = [(o, new_default.get(key(o))) for o in old_rates]
        changed = [(o, n) for o, n in moved if n and abs(float(o['premium']) - n['premium']) > 0.004]

        print(f"\n{d['insurer']}  ({name})")
        print(f"  rates : {len(old_rates):>4} -> {len(d['rates']):>4}")
        print(f"  plans : {len(old_plans):>4} -> {len(d['plans']):>4}")
        print(f"  products: {', '.join(products)}")
        print(f"  member types now: {sorted({str(r['member_type']) for r in d['rates']})} (was {sorted({str(r['member_type']) for r in old_rates})})")
        print(f"  rules : {table['rules_status']} -> approved   age basis: {(table['rules'] or {}).get('age_basis')} -> {d['rules']['age_basis']}"
              f"   GST: {json.dumps((table['rules'] or {}).get('gst_treatment'))[:40]} -> {d['rules']['gst_treatment']['treatment']}")
        print(f"  existing rate points whose figure changes: {len(changed)}")
        for o, n in changed[:6]:
            print(f"     {o['product_code'][:28]:<29} {o['plan_code']:<8} {o['band_label']:<10} {o['premium']} -> {n['premium']}")

        if not APPLY: continue

        os.makedirs(BACKUP, exist_ok=True)
        with open(os.path.join(BACKUP, f'gb-{tid[:8]}-{stamp}.json'), 'w') as f:
            json.dump({'table': table, 'rates': old_rates, 'plans': old_plans}, f)

        call('DELETE', f'gb_rates?rate_table_id=eq.{tid}', prefer='return=minimal')
        rows = [{
            'rate_table_id': tid, 'product_code': r['product_code'], 'plan_code': r['plan_code'],
            'band_label': r['band_label'], 'age_min': r['age_min'], 'age_max': r['age_max'],
            'premium': r['premium'], 'renewal_only': r['renewal_only'], 'member_type': r['member_type'],
            'dimensions': r['dimensions'] or {}, 'insurer_id': table['insurer_id'],
            'insurer_name': table['insurer_name'], 'effective_date': table['effective_date'],
            'canon_codes': CANON[r['product_code']],
        } for r in d['rates']]
        for i in range(0, len(rows), 500):
            call('POST', 'gb_rates', rows[i:i + 500], prefer='return=minimal')

        call('DELETE', f'gb_plans?rate_table_id=eq.{tid}', prefer='return=minimal')
        call('POST', 'gb_plans', [{
            'rate_table_id': tid, 'product_code': p['product_code'], 'plan_code': p['plan_code'],
            'plan_name': p['plan_name'], 'hospital_type': p['hospital_type'], 'beds': p['beds'],
            'co_payment': p['co_payment'], 'canon_codes': CANON[p['product_code']], 'sort_order': i,
        } for i, p in enumerate(d['plans'])], prefer='return=minimal')

        call('PATCH', f'gb_rate_tables?id=eq.{tid}', {
            'rules': {**d['rules'], 'calculator': d['source']},
            'rules_status': 'approved',
            'rules_updated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'age_basis': 'last_birthday',
            'product_code': ' · '.join(products),
        }, prefer='return=minimal')
        print(f"  APPLIED — backup in {BACKUP}")

    if not APPLY: print('\nDRY RUN — nothing written. Re-run with --apply.')


if __name__ == '__main__':
    main()
