import { useMemo, useState } from 'react';
import type { License } from '../types';
import {
  PLANS,
  PRO_FEATURES,
  TRIAL_DAYS,
  isValidKey,
  licenseStatusText,
  makeKey,
  trialDaysLeft,
  type Plan,
} from '../lib/license';
import { openExternal } from '../lib/platform';
import { Icon } from './Icon';
import { Modal } from './Dialogs';

type View = 'plans' | 'pay' | 'key';

interface LicenseDialogProps {
  license: License;
  onActivate: (key: string, email: string | null) => boolean;
  onClose: () => void;
}

const PAY_METHODS = ['Карта РФ', 'СБП', 'ЮMoney'];

export function LicenseDialog({ license, onActivate, onClose }: LicenseDialogProps) {
  const [view, setView] = useState<View>('plans');
  const [planId, setPlanId] = useState<Plan['id']>('forever');
  const [key, setKey] = useState(license.key ?? '');
  const [email, setEmail] = useState(license.email ?? '');
  const [error, setError] = useState('');

  const plan = useMemo(() => PLANS.find((item) => item.id === planId) ?? PLANS[1], [planId]);
  const paid = license.plan === 'pro';
  const daysLeft = trialDaysLeft(license);
  const demoKey = useMemo(() => makeKey('GOOSETEXT-DEMO'), []);

  const activate = () => {
    const value = key.trim();
    if (!value) {
      setError('Введите ключ из письма после оплаты.');
      return;
    }
    if (!isValidKey(value)) {
      setError('Ключ не подходит: проверьте символы и дефисы. Пример: GTXT-ABCDE-23456-…');
      return;
    }
    if (onActivate(value, email)) {
      onClose();
    } else {
      setError('Не удалось сохранить лицензию. Попробуйте ещё раз.');
    }
  };

  return (
    <Modal
      title="Лицензия GooseText"
      subtitle="Один ключ — на все ваши устройства"
      onClose={onClose}
      wide={view === 'plans'}
    >
      <div className="license">
        <div className={`license__status ${paid ? 'license__status--pro' : ''}`}>
          <div className="license__status-icon">
            <Icon name={paid ? 'check' : 'key'} size={18} />
          </div>
          <div className="license__status-body">
            <span className="license__status-title">
              {paid ? 'Pro активирован' : daysLeft > 0 ? 'Пробный период Pro' : 'Бесплатная версия'}
            </span>
            <span className="license__status-text">
              {paid
                ? licenseStatusText(license)
                : daysLeft > 0
                  ? `Осталось ${daysLeft} из ${TRIAL_DAYS} дней — все возможности открыты`
                  : 'Документы и папки сверх лимита закрыты. Данные никуда не пропали.'}
            </span>
          </div>
          {!paid && (
            <span className="license__badge">{daysLeft > 0 ? `Ещё ${daysLeft} дн.` : 'Триал закончился'}</span>
          )}
        </div>

        {view === 'plans' && (
          <>
            {!paid && (
              <div className="license-plans">
                {PLANS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`license-plan ${planId === item.id ? 'license-plan--active' : ''}`}
                    onClick={() => setPlanId(item.id)}
                  >
                    {item.best && <span className="license-plan__best">Выгодно</span>}
                    <span className="license-plan__name">{item.label}</span>
                    <span className="license-plan__price">
                      {item.price} <small>₽</small>
                    </span>
                    <span className="license-plan__period">{item.period}</span>
                    <span className="license-plan__hint">{item.hint}</span>
                  </button>
                ))}
              </div>
            )}

            <ul className="license-perks">
              {(paid ? ['Лицензия уже активна — спасибо, что поддерживаете гуся!'] : PRO_FEATURES).map((item) => (
                <li key={item}>
                  <Icon name="check" size={14} /> {item}
                </li>
              ))}
            </ul>

            {paid ? (
              <div className="license__actions">
                <span className="license__key">{license.key ?? 'Ключ активирован'}</span>
                <button type="button" className="btn btn--primary" onClick={onClose}>
                  Готово
                </button>
              </div>
            ) : (
              <div className="license__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setView('key')}>
                  <Icon name="key" size={15} /> У меня есть ключ
                </button>
                <button type="button" className="btn btn--primary" onClick={() => setView('pay')}>
                  Купить за {plan.price} ₽
                </button>
              </div>
            )}
          </>
        )}

        {view === 'pay' && (
          <div className="license-pay">
            <div className="license-pay__order">
              <div>
                <span className="license-pay__label">Тариф</span>
                <b>{plan.label}</b>
              </div>
              <div>
                <span className="license-pay__label">К оплате</span>
                <b>
                  {plan.price} ₽ <small>{plan.period}</small>
                </b>
              </div>
            </div>

            <div className="license-pay__methods">
              {PAY_METHODS.map((method) => (
                <span key={method} className="license-pay__method">
                  {method}
                </span>
              ))}
            </div>

            <div className="notice notice--warn">
              <Icon name="alert" size={14} />
              <span>
                В этой сборке платёжный провайдер не подключён: кнопка оплаты не спишет деньги. Прототип показывает
                полный путь покупки, а ключ выдаётся вручную — после подключения ЮKassa или CloudPayments он будет
                приходить на почту автоматически.
              </span>
            </div>

            <div className="license-pay__steps">
              <span>1. Оплата</span>
              <span>2. Ключ на почту</span>
              <span>3. Активация здесь</span>
            </div>

            <div className="license__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setView('plans')}>
                Назад
              </button>
              <button type="button" className="btn btn--primary" onClick={() => setView('key')}>
                У меня уже есть ключ
              </button>
            </div>
          </div>
        )}

        {view === 'key' && (
          <div className="license-key">
            <label className="license-key__field">
              <span>Ключ активации</span>
              <input
                className="input"
                value={key}
                onChange={(event) => {
                  setKey(event.target.value);
                  setError('');
                }}
                placeholder="GTXT-XXXXX-XXXXX-XXXXX"
                spellCheck={false}
                autoFocus
              />
            </label>
            <label className="license-key__field">
              <span>E-mail для чека (необязательно)</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>

            {error && (
              <div className="notice notice--error">
                <Icon name="alert" size={14} /> {error}
              </div>
            )}

            <details className="license-demo">
              <summary>Демонстрационный ключ для проверки</summary>
              <p>
                В прототипе ключи выдаются вручную. Этот ключ подходит только для проверки интерфейса — в настоящей
                продаже его заменит ключ с сервера после оплаты.
              </p>
              <code>{demoKey}</code>
              <button type="button" className="link" onClick={() => setKey(demoKey)}>
                подставить в поле
              </button>
            </details>

            <div className="license__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setView('plans')}>
                Назад
              </button>
              <button type="button" className="btn btn--primary" onClick={activate}>
                <Icon name="key" size={15} /> Активировать
              </button>
            </div>
          </div>
        )}

        <p className="license__foot">
          Вопросы по оплате:{' '}
          <button
            type="button"
            className="link"
            onClick={() => openExternal('https://goosetext.example/support')}
          >
            поддержка GooseText
          </button>
          . Лицензия хранится на устройстве и не требует интернета.
        </p>
      </div>
    </Modal>
  );
}
