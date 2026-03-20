import { useNavigate } from 'react-router-dom';

export default function Guide() {
  const navigate = useNavigate();
  const role = localStorage.getItem('user_role') || 'Гость';

  // Уровень доступа: чем выше, тем больше инструкций видит пользователь
  const roleLevels = { 'superadmin': 4, 'boss': 4, 'moderator': 3, 'foreman': 2, 'worker': 1, 'driver': 1, 'Гость': 0 };
  const level = roleLevels[role] || 0;

  const SectionTitle = ({ icon, title }) => (
      <h2 className="text-xl md:text-2xl font-bold text-gray-800 dark:text-white flex items-center mb-4 mt-10 border-b dark:border-gray-700 pb-2">
          <span className="text-2xl md:text-3xl mr-3">{icon}</span> {title}
      </h2>
  );

  const Block = ({ title, children }) => (
      <div className="bg-white dark:bg-gray-800/50 p-5 rounded-xl border border-gray-200 dark:border-gray-700 mb-4 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-lg font-bold text-blue-700 dark:text-blue-400 mb-3">{title}</h3>
          <div className="text-gray-600 dark:text-gray-300 text-sm md:text-base space-y-3 leading-relaxed">
              {children}
          </div>
      </div>
  );

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-2 pb-20">

        {/* ВВОДНАЯ ЧАСТЬ */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl shadow-lg p-6 md:p-8 text-white mb-8">
            <h1 className="text-3xl md:text-4xl font-extrabold mb-3">База знаний</h1>
            <p className="text-blue-100 text-sm md:text-base max-w-2xl">
                Добро пожаловать в официальную инструкцию по платформе «ВИКС Расписание». Здесь собраны ответы на самые частые вопросы о регистрации, работе с нарядами и привязке мессенджеров.
            </p>
        </div>

        {/* РАЗДЕЛ 1: РЕГИСТРАЦИЯ И АККАУНТЫ (Видят все) */}
        {level >= 1 && (
            <>
                <SectionTitle icon="🔐" title="Регистрация и аккаунты" />

                <Block title="Для рабочих и водителей (Быстрый вход)">
                    <p>Если вы рабочий или водитель спецтехники, ваш прораб или менеджер должен прислать вам специальный <b>код приглашения</b>.</p>
                    <ul className="list-disc pl-5 space-y-2 mt-2">
                        <li>Откройте бота в Telegram или MAX.</li>
                        <li>Отправьте команду: <code>/join 123456</code> (где 123456 — ваш код).</li>
                        <li>Бот <b>автоматически</b> зарегистрирует вас по вашему имени из профиля и выдаст ссылку-кнопку для входа на платформу. Никаких паролей вводить не нужно!</li>
                    </ul>
                </Block>

                <Block title="Для руководства и прорабов">
                    <p>Для доступа к административным функциям требуется <b>системный пароль</b>.</p>
                    <ul className="list-disc pl-5 space-y-2 mt-2">
                        <li>Отправьте боту команду <code>/start</code>.</li>
                        <li>Введите свой системный пароль.</li>
                        <li>Укажите ваши Имя и Фамилию. После этого бот выдаст вам полный доступ к платформе.</li>
                    </ul>
                </Block>

                <Block title="Как привязать и Telegram, и MAX одновременно?">
                    <p>Вы можете получать уведомления сразу в оба мессенджера и входить на сайт с компьютера под одним профилем.</p>
                    <ol className="list-decimal pl-5 space-y-2 mt-2">
                        <li>Зайдите в бота, в котором вы <b>уже зарегистрированы</b>, и отправьте команду <code>/web</code>. Бот выдаст вам 6-значный код.</li>
                        <li>Зайдите в <b>нового</b> бота (или откройте сайт на ПК).</li>
                        <li>На экране приветствия введите этот 6-значный код вместо пароля. Ваши аккаунты будут мгновенно объединены!</li>
                    </ol>
                </Block>
            </>
        )}

        {/* РАЗДЕЛ 2: РАБОТА С НАРЯДАМИ (От прораба и выше) */}
        {level >= 2 && (
            <>
                <SectionTitle icon="📝" title="Работа с заявками (Для прорабов)" />

                <Block title="Как создать заявку на выезд?">
                    <p>На главной странице (Дашборд) нажмите большую зеленую кнопку <b>«Создать заявку»</b>.</p>
                    <ol className="list-decimal pl-5 space-y-2 mt-2">
                        <li><b>Дата и адрес:</b> Выберите дату выезда и укажите точный адрес объекта.</li>
                        <li><b>Бригада:</b> Выберите вашу бригаду и отметьте галочками тех сотрудников, которые выйдут на смену.</li>
                        <li><b>Техника:</b> Нажмите «Добавить технику», выберите нужную машину и укажите время её работы (например, с 08:00 до 17:00).</li>
                        <li><b>Отправка:</b> Проверьте данные и нажмите «Отправить на согласование». Заявка перейдет к модераторам.</li>
                    </ol>
                </Block>
            </>
        )}

        {/* РАЗДЕЛ 3: МОДЕРАЦИЯ (От модератора и выше) */}
        {level >= 3 && (
            <>
                <SectionTitle icon="⚖️" title="Модерация (Для офиса)" />

                <Block title="Проверка и утверждение">
                    <ul className="list-disc pl-5 space-y-2">
                        <li>Все новые заявки от прорабов попадают во вкладку <b>«На модерации»</b>.</li>
                        <li>Вы можете открыть любую карточку, проверить состав людей и техники.</li>
                        <li>При нажатии <b>«Одобрить»</b> формируется красивый графический наряд-допуск, который автоматически отправляется в рабочие группы (Telegram/MAX).</li>
                        <li>Если вы нажмете <b>«Отклонить»</b>, система попросит указать причину, и прораб получит уведомление в ЛС с просьбой исправить ошибку.</li>
                    </ul>
                </Block>
            </>
        )}

        {/* РАЗДЕЛ 4: УДОБСТВО / ПРИЛОЖЕНИЕ (Видят все) */}
        {level >= 1 && (
            <>
                <SectionTitle icon="📱" title="Установка на телефон (PWA)" />
                <p className="text-gray-600 dark:text-gray-400 mb-4 px-2">
                    Вы можете установить нашу платформу как полноценное приложение на свой смартфон. Оно будет работать быстрее и появится на рабочем столе.
                </p>

                <Block title="🍎 Устройства Apple (iPhone/iPad)">
                    <p className="font-semibold text-blue-700 dark:text-blue-400 mb-2">Браузер Safari:</p>
                    <ol className="list-decimal pl-5 space-y-3 text-sm">
                        <li>Откройте сайт платформы (<code>miniapp.viks22.ru</code>) в браузере <b>Safari</b>.</li>
                        <li>В самом низу экрана по центру нажмите значок <b>«Поделиться»</b> (квадрат со стрелочкой ⬆️).</li>
                        <li>Прокрутите меню вниз и выберите <b>«На экран "Домой"»</b> ➕.</li>
                        <li>Нажмите синюю кнопку <b>«Добавить»</b> в правом верхнем углу.</li>
                    </ol>
                </Block>

                <Block title="🤖 Устройства Android">
                    <p className="font-semibold text-blue-700 dark:text-blue-400 mb-2">Google Chrome / Яндекс Браузер:</p>
                    <ol className="list-decimal pl-5 space-y-3 text-sm">
                        <li>Откройте сайт платформы в браузере.</li>
                        <li>Нажмите на <b>Три точки (⋮)</b> в правом верхнем (или нижнем) углу экрана.</li>
                        <li>В открывшемся меню выберите пункт <b>«Добавить на главный экран»</b> (или «Ярлык на рабочий стол / Установить приложение»).</li>
                        <li>Подтвердите установку, нажав «Добавить».</li>
                    </ol>
                </Block>
            </>
        )}

    </main>
  );
}