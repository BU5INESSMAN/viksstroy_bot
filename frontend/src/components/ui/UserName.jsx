import { displayFio } from '../../utils/fioFormat';

/**
 * Renders a user's FIO. Prefers the new last/first/middle fields, falls
 * back to the denormalized `fio` column during rollout.
 *
 *   <UserName user={user} />
 *   <UserName user={user} fallback="—" className="font-bold" />
 */
export default function UserName({ user, fallback = '', className = '', as: Tag = 'span' }) {
    const name = displayFio(user) || fallback;
    return <Tag className={className}>{name}</Tag>;
}
