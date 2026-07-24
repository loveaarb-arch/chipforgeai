import { useWindowDimensions } from 'react-native';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

interface BreakpointInfo {
  width:     number;
  height:    number;
  bp:        Breakpoint;
  isMobile:  boolean;  // < 768
  isTablet:  boolean;  // 768–1199
  isDesktop: boolean;  // ≥ 1200
}

export function useBreakpoint(): BreakpointInfo {
  const { width, height } = useWindowDimensions();
  const bp: Breakpoint =
    width >= 1200 ? 'desktop' :
    width >= 768  ? 'tablet'  :
                    'mobile';
  return {
    width, height, bp,
    isMobile:  bp === 'mobile',
    isTablet:  bp === 'tablet',
    isDesktop: bp === 'desktop',
  };
}
