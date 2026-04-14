import { createContext, useContext, useMemo } from 'react';
import { getIndustryPack } from './data/industryPacks';

const IndustryDataContext = createContext(null);

export function IndustryDataProvider({ industry, children }) {
  const value = useMemo(() => getIndustryPack(industry), [industry]);
  return <IndustryDataContext.Provider value={value}>{children}</IndustryDataContext.Provider>;
}

export function useIndustryData() {
  const v = useContext(IndustryDataContext);
  if (!v) {
    throw new Error('useIndustryData must be used within IndustryDataProvider');
  }
  return v;
}
