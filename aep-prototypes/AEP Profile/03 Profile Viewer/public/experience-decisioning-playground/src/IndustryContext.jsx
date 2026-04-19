import { createContext, useContext, useMemo } from 'react';
import { getIndustryPack } from './data/industryPacks';

const IndustryDataContext = createContext(null);
const IndustryKeyContext = createContext('retail');

export function IndustryDataProvider({ industry, children }) {
  const value = useMemo(() => getIndustryPack(industry), [industry]);
  const key = industry && typeof industry === 'string' ? industry : 'retail';
  return (
    <IndustryKeyContext.Provider value={key}>
      <IndustryDataContext.Provider value={value}>{children}</IndustryDataContext.Provider>
    </IndustryKeyContext.Provider>
  );
}

export function useIndustryData() {
  const v = useContext(IndustryDataContext);
  if (!v) {
    throw new Error('useIndustryData must be used within IndustryDataProvider');
  }
  return v;
}

/** Current industry id (e.g. retail, fsi, travel) — same as App state / localStorage key. */
export function useIndustryKey() {
  return useContext(IndustryKeyContext);
}
