import { useNavigate, Link } from 'react-router-dom';

export default function Guide() {
  const navigate = useNavigate();
  const role = localStorage.getItem('user_role') || 'Гость';

  // Уровень доступа: чем выше, тем больше инструкций видит пользователь
  const roleLevels = { 'superadmin': 4, 'boss': 4, 'moderator': 3, 'foreman': 2, 'worker': 1, 'driver': 1, 'Гость': 0 };
  const level = roleLevels[role] || 0;

  const SectionTitle = ({ icon, title }) => (
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center mb-4 mt-10 border-b dark:border-gray-700 pb-2">
          <span className="text-3xl mr-3">{icon}</span> {title}
      </h2>
  );

  const Block = ({ title, children }) => (
      <div className="bg-white dark:bg-gray-800/50 p-5 rounded-xl border border-gray-200 dark:border-gray-700 mb-4 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-lg font-bold text-blue-700 dark:text-blue-400 mb-3">{title}</h3>
          <div className="text-gray-600 dark:text-gray-300 text-sm md:text-base leading-relaxed">
              {children}
          </div>
      </div>
  );

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-12">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 sm:p-10 border border-gray-100 dark:border-gray-700 transition-colors">
            <div className="text-center max-w-2xl mx-auto mb-10">
                <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-6 text-4xl transform rotate-3 shadow-inner">📖</div>
                <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-3">База знаний</h1>
                <p className="text-gray-500 dark:text-gray-400">Инструкции по работе с системой «ВИКС Расписание» для вашей роли: <b className="text-gray-700 dark:text-gray-300 uppercase">{role}</b></p>
            </div>

            {/* ИНСТРУКЦИИ ДОСТУПНЫЕ ВСЕМ (УРОВЕНЬ 0+) */}
            {level >= 0 && (
                <>
                    <SectionTitle icon="🔗" title="Аккаунты и Доступ" />

                    <Block title="Как привязать и Telegram, и MAX одновременно?">
                        <p className="mb-3">Вы можете связать оба мессенджера с одним профилем, чтобы иметь доступ к своим заявкам откуда угодно:</p>
                        <ol className="list-decimal pl-5 space-y-2 mb-3">
                            <li>Откройте бот мессенджера, в котором вы <b>уже зарегистрированы</b>.</li>
                            <li>Отправьте ему команду <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono text-gray-800 dark:text-gray-200">/web</code>. Бот выдаст вам 6-значный код (он действует 15 минут).</li>
                            <li>Зайдите в <b>новый мессенджер</b> (или откройте платформу в браузере) и перейдите в 👤 <b>Мой профиль</b>.</li>
                            <li>В блоке "Привязка мессенджеров" введите полученный код и нажмите <b>Привязать</b>.</li>
                        </ol>
                        <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg border border-blue-100 dark:border-blue-800/50">
                            💡 Подсказка: По этому же коду можно входить в систему с обычного компьютера, просто открыв сайт в браузере.
                        </p>
                    </Block>

                    {level >= 1 && (
                        <Block title="Как вступить в бригаду или привязать технику?">
                            <p className="mb-3">Руководитель (или модератор) отправит вам пригласительное сообщение. В нём будет 3 варианта подключения на выбор:</p>
                            <ul className="list-disc pl-5 space-y-3">
                                <li><b>Telegram:</b> Просто перейдите по ссылке, бот откроется сам. Нажмите "Подтвердить".</li>
                                <li><b>MAX:</b> Скопируйте команду вида <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono text-gray-800 dark:text-gray-200">/join 123456</code> и отправьте её боту в чат. Бот пришлет кнопку для подтверждения.</li>
                                <li><b>Web:</b> Перейдите по прямой ссылке в любом браузере смартфона.</li>
                            </ul>
                        </Block>
                    )}
                </>
            )}

            {/* ИНСТРУКЦИИ ДЛЯ РАБОЧИХ И ВОДИТЕЛЕЙ (УРОВЕНЬ 1+) */}
            {level >= 1 && level < 3 && (
                <>
                    <SectionTitle icon="👷‍♂️" title="Для исполнителей" />

                    <Block title="Где смотреть куда мне ехать завтра?">
                        <p className="mb-2">Вся информация находится в разделе <b>«Мои заявки»</b> (иконка планшета в нижнем меню).</p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>Там отображаются только те наряды, в которые прораб добавил <b>вашу бригаду</b> или <b>вашу технику</b>.</li>
                            <li>Заявки появляются там только после того, как их <b>одобрит Модератор</b> (вечером накануне).</li>
                        </ul>
                    </Block>

                    {role === 'driver' && (
                        <Block title="Как освободить технику?">
                            <p className="mb-2">Если вы закончили работу на объекте раньше времени:</p>
                            <ol className="list-decimal pl-5 space-y-1">
                                <li>Зайдите в приложение.</li>
                                <li>Откройте свой профиль (нажмите на 👤 в меню в правом верхнем углу).</li>
                                <li>Нажмите красную кнопку <b>«Освободить мою технику»</b>. Система оповестит всех, что вы свободны для других задач.</li>
                            </ol>
                        </Block>
                    )}
                </>
            )}

            {/* ИНСТРУКЦИИ ДЛЯ ПРОРАБОВ (УРОВЕНЬ 2+) */}
            {level >= 2 && (
                <>
                    <SectionTitle icon="📋" title="Работа с заявками" />
                    <Block title="Как создать новую заявку на завтра?">
                        <ol className="list-decimal pl-5 space-y-2">
                            <li>Нажмите на <b>синюю кнопку плюса (+)</b> по центру нижнего меню.</li>
                            <li>Выберите дату, адрес объекта и нужную бригаду из выпадающего списка.</li>
                            <li>В поле «Состав» отметьте галочками тех рабочих, которые поедут на объект.</li>
                            <li>Если нужна техника, нажмите «Добавить технику», выберите категорию, саму машину и укажите время работы.</li>
                            <li>Добавьте комментарий (опционально) и нажмите <b>Отправить на проверку</b>.</li>
                        </ol>
                        <p className="mt-3 text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg border border-yellow-200 dark:border-yellow-800">
                            ⚠️ Заявка попадет к модератору. Как только он её проверит и нажмет «Одобрить», она автоматически опубликуется в общий рабочий чат в 19:00.
                        </p>
                    </Block>

                    <Block title="Как изменить или удалить заявку?">
                        <ul className="list-disc pl-5 space-y-2">
                            <li>Изменить заявку можно только пока она находится в статусе <b>«Ожидает проверки»</b> (желтая карточка на Главной). Просто нажмите на неё.</li>
                            <li>Удалить заявку прораб не может. Если вы ошиблись, свяжитесь с Модератором или Руководителем, чтобы они отклонили/отменили её.</li>
                        </ul>
                    </Block>
                </>
            )}

            {/* ИНСТРУКЦИИ ДЛЯ МОДЕРАТОРОВ И ВЫШЕ (УРОВЕНЬ 3+) */}
            {level >= 3 && (
                <>
                    <SectionTitle icon="⚙️" title="Администрирование" />

                    <Block title="Как приглашать людей в платформу?">
                        <p className="mb-3">Новая система инвайтов позволяет избежать ручной выдачи паролей рабочим и водителям.</p>
                        <ol className="list-decimal pl-5 space-y-2">
                            <li>Перейдите в раздел <b>Бригады</b> или <b>Автопарк</b>.</li>
                            <li>Нажмите «Управлять» (для бригады) или кликните по технике.</li>
                            <li>Нажмите <b>🔗 Сгенерировать ссылку / Пригласить</b>.</li>
                            <li>Нажмите синюю кнопку <b>📄 Скопировать всё сообщение</b>.</li>
                            <li>Отправьте скопированный текст работнику в любой мессенджер. Он сам перейдет по удобной ему ссылке, и система автоматически привяжет его аккаунт к нужной карточке.</li>
                        </ol>
                    </Block>

                    <Block title="Как публиковать одобренные заявки?">
                        <p className="mb-2">Система работает по принципу отложенной публикации:</p>
                        <ul className="list-disc pl-5 space-y-2">
                            <li>Прорабы кидают заявки в течение дня. Вы проверяете их в разделе <b>Заявки</b> и нажимаете <b>Одобрить</b>.</li>
                            <li>В настройках системы (раздел <b>Система</b>) установлено время «Авто-публикации» (например, 19:00).</li>
                            <li>Ровно в это время бот соберет <b>все</b> одобренные на этот момент заявки, сгенерирует для каждой красивую картинку-наряд и разом отправит их в общую рабочую группу.</li>
                            <li>Если вам нужно опубликовать наряд срочно (прямо сейчас), вы можете зайти в раздел Система → Ручное управление → нажать «Опубликовать».</li>
                        </ul>
                    </Block>

                    <Block title="Как редактировать базу сотрудников?">
                        <p className="mb-2">Вы можете менять должности, роли и удалять неактуальных сотрудников:</p>
                        <ol className="list-decimal pl-5 space-y-1">
                            <li>Перейдите в раздел <b>Система</b>.</li>
                            <li>В блоке «Пользователи бота» найдите нужного человека и нажмите <b>Профиль</b>.</li>
                            <li>Измените ФИО, роль или назначьте его в бригаду прямо оттуда.</li>
                            <li>Если человек уволился, нажмите <b>🗑 Удалить профиль</b> — он навсегда потеряет доступ к системе и будет отвязан от всех бригад и машин.</li>
                        </ol>
                    </Block>
                </>
            )}

            {/* БЛОК PWA ДЛЯ ВСЕХ */}
            <SectionTitle icon="📱" title="Установка на телефон" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 className="font-bold text-xl text-gray-900 dark:text-white flex items-center mb-4 border-b dark:border-gray-700 pb-2">
                        🍎 Устройства Apple (iOS)
                    </h3>
                    <p className="font-semibold text-blue-700 dark:text-blue-400 mb-2">Браузер Safari:</p>
                    <ol className="list-decimal pl-5 space-y-3 text-sm text-gray-700 dark:text-gray-300">
                        <li>Откройте сайт платформы в браузере <b>Safari</b>.</li>
                        <li>В самом низу экрана по центру нажмите значок <b>«Поделиться»</b> (квадрат со стрелочкой ⬆️).</li>
                        <li>Прокрутите немного вниз и выберите <b>«На экран "Домой"»</b> ➕.</li>
                        <li>Нажмите синюю кнопку <b>«Добавить»</b>.</li>
                    </ol>
                </div>

                <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 className="font-bold text-xl text-gray-900 dark:text-white flex items-center mb-4 border-b dark:border-gray-700 pb-2">
                        🤖 Устройства Android
                    </h3>
                    <p className="font-semibold text-blue-700 dark:text-blue-400 mb-2">Google Chrome / Яндекс:</p>
                    <ol className="list-decimal pl-5 space-y-3 text-sm text-gray-700 dark:text-gray-300">
                        <li>Нажмите на <b>Три точки (⋮)</b> в верхнем или нижнем углу браузера.</li>
                        <li>В меню выберите пункт <b>«Добавить на главный экран»</b> (или «Ярлык на рабочий стол»).</li>
                        <li>Подтвердите действие, нажав <b>«Добавить»</b>.</li>
                    </ol>
                </div>
            </div>

        </div>
    </main>
  );
}