import { useEffect, useRef } from 'react';
import { rulesV2 } from '@/data/erp';
import { useStore } from '@/data/store';
import { ERP_DEFAULTS, ERP_RULES_V2 } from '@/data/types';

/**
 * 2.13: the first time an administrator opens this version, their app switches the company to the
 * new order and finance rules with the agreed defaults (₦2m limit, cash and carry, HCOs only, reps
 * order and the office invoices). It is one ordinary settings change in the journal, so every device
 * applies the new rules from that moment on and earlier sales keep the old ones.
 */
export function ErpRulesUpgrade() {
  const { admin, erp, canEdit, data, run, session } = useStore();
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || !admin || !erp || !canEdit || session?.demo || rulesV2(data)) return;
    tried.current = true;
    try {
      run({ type: 'settings.update', settings: { erp: { ...ERP_DEFAULTS, ...data.settings.erp, ...ERP_RULES_V2 } } });
    } catch (e) {
      console.warn('Could not switch on the 2.13 rules', e);
    }
  }, [admin, erp, canEdit, data, run, session?.demo]);
  return null;
}
