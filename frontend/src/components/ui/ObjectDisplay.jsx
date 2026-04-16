// Usage:
//   Block (cards, modals, headers):
//   <ObjectDisplay name={app.object_name} address={app.object_address} />
//
//   Inline (selectors, compact lists):
//   <ObjectDisplay name={obj.name} address={obj.address} variant="inline" />
//
//   No icon (very tight spaces):
//   <ObjectDisplay name={obj.name} address={obj.address} showIcon={false} />

import { MapPin } from 'lucide-react';

/**
 * Renders an object's name and address with consistent visual hierarchy.
 *
 * Emil principles: the name carries the weight, address is muted
 * secondary. No decoration beyond the MapPin marker — typography does
 * the work.
 *
 * Props:
 *   name              (required) object name
 *   address           optional address
 *   variant           'block' | 'inline'  (default 'block')
 *   showIcon          boolean (default true)
 *   nameClassName     override name typography
 *   addressClassName  override address typography
 *   className         container classes
 */
export default function ObjectDisplay({
    name,
    address,
    variant = 'block',
    showIcon = true,
    nameClassName,
    addressClassName,
    className = '',
}) {
    if (!name) return null;

    const trimmedAddress = (address || '').trim();

    if (variant === 'inline') {
        return (
            <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>
                {showIcon && <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                <span className={nameClassName || 'font-medium truncate'}>{name}</span>
                {trimmedAddress && (
                    <>
                        <span className="text-gray-400 dark:text-gray-500 shrink-0">•</span>
                        <span className={addressClassName || 'text-gray-500 dark:text-gray-400 truncate'}>{trimmedAddress}</span>
                    </>
                )}
            </span>
        );
    }

    // variant === 'block'
    return (
        <div className={`flex items-start gap-1.5 min-w-0 ${className}`}>
            {showIcon && <MapPin className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />}
            <div className="min-w-0">
                <div className={nameClassName || 'font-semibold text-gray-900 dark:text-gray-100 truncate'}>{name}</div>
                {trimmedAddress && (
                    <div className={addressClassName || 'text-xs text-gray-500 dark:text-gray-400 truncate'}>{trimmedAddress}</div>
                )}
            </div>
        </div>
    );
}
