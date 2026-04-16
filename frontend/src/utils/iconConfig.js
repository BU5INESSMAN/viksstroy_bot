import {
    Truck, Shovel, HardHat, Wrench, Hammer, Drill,
    Forklift, Tractor, Construction, Building2,
    Warehouse, PaintBucket, Pipette, Ruler, Cog,
    Zap, Fuel, Weight, Container,
    Users, UserCheck, UserCog, Shield, Star,
    Pickaxe, Scissors, Axe, Compass, Gauge,
} from 'lucide-react';

// Equipment category icons — construction & transport themed.
// Note: `Crane` was requested but does not ship in the installed
// lucide-react version, so it is omitted. All other icons verified
// against node_modules/lucide-react/dist/esm/icons/.
export const EQUIPMENT_ICONS = {
    truck:        { component: Truck,        label: 'Грузовик' },
    shovel:       { component: Shovel,       label: 'Лопата' },
    hardhat:      { component: HardHat,      label: 'Каска' },
    wrench:       { component: Wrench,       label: 'Гаечный ключ' },
    hammer:       { component: Hammer,       label: 'Молоток' },
    drill:        { component: Drill,        label: 'Дрель' },
    forklift:     { component: Forklift,     label: 'Погрузчик' },
    tractor:      { component: Tractor,      label: 'Трактор' },
    construction: { component: Construction, label: 'Стройка' },
    building:     { component: Building2,    label: 'Здание' },
    warehouse:    { component: Warehouse,    label: 'Склад' },
    paintbucket:  { component: PaintBucket,  label: 'Краска' },
    pipette:      { component: Pipette,      label: 'Пипетка' },
    ruler:        { component: Ruler,        label: 'Линейка' },
    cog:          { component: Cog,          label: 'Механизм' },
    zap:          { component: Zap,          label: 'Энергия' },
    fuel:         { component: Fuel,         label: 'Топливо' },
    weight:       { component: Weight,       label: 'Груз' },
    container:    { component: Container,    label: 'Контейнер' },
    pickaxe:      { component: Pickaxe,      label: 'Кирка' },
    scissors:     { component: Scissors,     label: 'Ножницы' },
    axe:          { component: Axe,          label: 'Топор' },
    compass:      { component: Compass,      label: 'Компас' },
    gauge:        { component: Gauge,        label: 'Датчик' },
};

// Team icons — people & organization themed.
export const TEAM_ICONS = {
    users:        { component: Users,        label: 'Бригада' },
    usercheck:    { component: UserCheck,    label: 'Проверенный' },
    usercog:      { component: UserCog,      label: 'Специалист' },
    shield:       { component: Shield,       label: 'Охрана' },
    star:         { component: Star,         label: 'Звезда' },
    hardhat:      { component: HardHat,      label: 'Каска' },
    hammer:       { component: Hammer,       label: 'Молоток' },
    wrench:       { component: Wrench,       label: 'Гаечный ключ' },
    construction: { component: Construction, label: 'Стройка' },
    truck:        { component: Truck,        label: 'Транспорт' },
    building:     { component: Building2,    label: 'Здание' },
    zap:          { component: Zap,          label: 'Энергия' },
    cog:          { component: Cog,          label: 'Механизм' },
    pickaxe:      { component: Pickaxe,      label: 'Кирка' },
    gauge:        { component: Gauge,        label: 'Датчик' },
};

// Resolve icon component by key, with graceful fallback.
export function getIconComponent(iconKey, registry = EQUIPMENT_ICONS) {
    const entry = registry[iconKey];
    return entry ? entry.component : null;
}

// Default icons used when none is configured.
export const DEFAULT_EQUIPMENT_ICON = 'cog';
export const DEFAULT_TEAM_ICON = 'users';
