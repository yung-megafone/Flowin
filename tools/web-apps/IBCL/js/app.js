/*
 * IBCL V2 modular development file: app.js
 * Extracted from the standalone release build.
 */

/*
        ========================================================================
        IBCL JAVASCRIPT MAP
        ------------------------------------------------------------------------
        01. State + constants
        02. Time helpers
        03. Loss math
        04. Persistence / localStorage
        05. Ticket parsing
        06. Translations
        07. Theme + language controls
        08. App initialization
        09. Checkbox behavior
        10. Live preview metrics
        11. Event lifecycle
        12. Event log rendering
        13. Modal / delete / clear actions
        14. Copy-for-Quip export
        15. Toast notification
        16. Graph View roadmap
        17. Auto-update controls
        ========================================================================
        */

        /*
        ========================================================================
        01. STATE + CONSTANTS
        ========================================================================
        */
        let events = [];
        let editingId = null;
        let itemToDeleteId = null;
        let isClearAll = false;
        let currentLang = 'en';
        const STORAGE_KEY = 'ibcl_state_v2.0';
        const PMT_WEIGHT = 1 / 12;
        const DD_WEIGHT = 1 / 24;
        const PRESORT_HOURLY_DIVISOR = 9 * 18;
        const PRESORT_PERF_DIVISOR = 18;
        let autoUpdateEnabled = false;
        let autoUpdateIntervalSeconds = 60;
        let autoUpdateTimer = null;
        let startTimeAutoSync = true;
        let startTimeManuallyEdited = false;
        let startTimeSyncTimer = null;
        let projectionSampleTimer = null;


        /*
        ========================================================================
        02. TIME HELPERS
        ------------------------------------------------------------------------
        Handles HH:MM values and night-shift crossing-midnight math.
        ========================================================================
        */
        function nowHM() { return new Date().toTimeString().slice(0, 5); }
        function minutesBetween(start, end) {
            if (!start || !end) return 0;
            const [sh, sm] = start.split(':').map(Number);
            const [eh, em] = end.split(':').map(Number);
            let d = (eh * 60 + em) - (sh * 60 + sm);
            if (d < 0) d += 1440; // crosses midnight (night shift)
            return d;
        }
        function addMinutesHM(hm, mins) {
            let [h, m] = hm.split(':').map(Number);
            let t = ((h * 60 + m + mins) % 1440 + 1440) % 1440;
            return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
        }


        /*
        ========================================================================
        03. LOSS MATH
        ------------------------------------------------------------------------
        Normal PID-connected areas use data-weight.

        Pre-Sort is intentionally separate:
          - There are only two selectable Pre-Sort lines: East and West.
          - Each selected Pre-Sort line contributes 1/18 to performance basis.
          - Pre-Sort goal basis follows floor math: PID Goal ÷ 9 ÷ 18.

        Displayed loss remains the higher of goal-based loss and performance-based
        loss so the tracker errs toward the larger operational impact.
        ========================================================================
        */
        function computeLossValues(dt, weight, pidGoal, shiftHours, perf15, presortCount = 0) {
            let goal = 0, perf = 0, presortGoal = 0;
            if (dt > 0 && pidGoal > 0 && shiftHours > 0 && weight > 0) {
                goal = Math.round((pidGoal / shiftHours) * (dt / 60) * weight);
            }
            if (dt > 0 && perf15 > 0 && weight > 0) {
                perf = Math.round(perf15 * (dt / 15) * weight);
            }
            if (dt > 0 && pidGoal > 0 && presortCount > 0) {
                // Pre-Sort is not tied to PID checkboxes. There are only two selectable lines:
                // West Pre-Sort and East Pre-Sort. Each selected pre-sort line is 1 of 18 inbound lines.
                // Goal basis from floor math: PID Goal ÷ 9 ÷ 18 = one pre-sort line hourly goal.
                presortGoal = Math.round((pidGoal / PRESORT_HOURLY_DIVISOR) * (dt / 60) * presortCount);
            }
            goal += presortGoal;
            if (dt > 0 && perf15 > 0 && presortCount > 0) {
                perf += Math.round((perf15 / PRESORT_PERF_DIVISOR) * (dt / 15) * presortCount);
            }
            return { goalLoss: goal, perfLoss: perf, loss: Math.max(goal, perf) };
        }
        function recompute(ev) {
            if (ev.open || !ev.endTime) {
                ev.downtime = 0; ev.goalLoss = 0; ev.perfLoss = 0; ev.loss = 0;
                return;
            }
            ev.downtime = minutesBetween(ev.startTime, ev.endTime);
            const r = computeLossValues(ev.downtime, ev.weight, ev.pidGoal, ev.shiftHours, ev.perf15, ev.presortCount || 0);
            ev.goalLoss = r.goalLoss; ev.perfLoss = r.perfLoss; ev.loss = r.loss;
        }


        /*
        ========================================================================
        04. PERSISTENCE / LOCALSTORAGE
        ------------------------------------------------------------------------
        Saves shift inputs, events, and dark-mode preference locally in the browser.
        Nothing is sent anywhere by this file.
        ========================================================================
        */
        function saveState() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    events,
                    pidGoal: document.getElementById('pidGoal').value,
                    shiftHours: document.getElementById('shiftHours').value,
                    perf15: document.getElementById('perf15').value,
                    darkMode: document.body.classList.contains('dark'),
                    autoUpdateEnabled,
                    autoUpdateIntervalSeconds,
                    startTimeAutoSync
                }));
            } catch (e) { }
        }
        function loadState() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('ibcl_state_v1.9') || localStorage.getItem('ibcl_state_v1.8') || localStorage.getItem('ixd_loss_state_v1.4') || localStorage.getItem('ixd_loss_state_v13');
                if (!raw) {
                    document.body.classList.add('dark');
                    return;
                }
                const st = JSON.parse(raw);
                events = Array.isArray(st.events) ? st.events : [];
                // migrate legacy events (had .time + .downtime, no start/end times)
                events.forEach(ev => {
                    if (ev.startTime === undefined) {
                        ev.startTime = ev.time || nowHM();
                        ev.endTime = ev.downtime ? addMinutesHM(ev.startTime, ev.downtime) : ev.startTime;
                        ev.open = false;
                        if (ev.issue === undefined) ev.issue = '';
                    }
                });
                if (st.pidGoal) document.getElementById('pidGoal').value = st.pidGoal;
                if (st.shiftHours) document.getElementById('shiftHours').value = st.shiftHours;
                if (st.perf15 !== undefined && st.perf15 !== '') document.getElementById('perf15').value = st.perf15;
                if (st.darkMode !== false) document.body.classList.add('dark');
                if (typeof st.autoUpdateEnabled === 'boolean') autoUpdateEnabled = st.autoUpdateEnabled;
                if (st.autoUpdateIntervalSeconds) autoUpdateIntervalSeconds = Number(st.autoUpdateIntervalSeconds) || 60;
                if (typeof st.startTimeAutoSync === 'boolean') startTimeAutoSync = st.startTimeAutoSync;
            } catch (e) { events = []; document.body.classList.add('dark'); }
        }
        function parseTicket(raw) {
            raw = (raw || '').trim();
            const m = raw.match(/https?:\/\/\S+/);
            const url = m ? m[0] : '';
            let title = (url ? raw.replace(url, '') : raw).replace(/\s+/g, ' ').trim();
            if (!title) title = url || '(no ticket)';
            return { title, url };
        }


        /*
        ========================================================================
        06. TRANSLATIONS
        ------------------------------------------------------------------------
        Keep user-facing strings here when they are controlled by data-i18n.
        Static placeholder copy can stay in HTML until the feature is live.
        ========================================================================
        */
        const translations = {
            en: {
                calc_title: "IBCL - Inbound Carton Loss",
                calc_subtitle: "Set the shift numbers, select the affected area, then start the event.",
                live_metrics_label: "Live Preview",
                metric_waiting: "Select an area to preview loss.",
                graph_hint: "Reserved for a future pace/projection view. This should compare goal pace, rolling 15-minute performance readings, logged losses, and any official processed-carton count if I find a clean source later.",
                selected_label: "Selected",
                share_label: "Share",
                hour_goal_label: "1 Hr Goal",
                perf_basis_label: "15m Perf",
                est_15_label: "Estimated 15 Min Loss",
                active_loss_label: "Active Loss Now",
                total_loss_short_label: "Total Loss",
                throughput_label: "Manual Throughput Pace",
                goal_delta_label: "Vs Goal",
                cb_label: "CrossBelt / CB",
                cb_hint: "Use this when CrossBelt is stopped. It selects every PID-connected area plus both Pre-Sort lines.",
                cb_checkbox_label: "CB Down - Select All Flow",
                location_gate_hint: "Add ticket details above to unlock affected-area selection.",
                pid_goal_label: "PID Goal",
                shift_hours_label: "Shift Hours",
                performance_15_label: "Prev. 15 Min Cartons",
                ticket_label: "Ticket (paste link)",
                ticket_placeholder: "Paste ticket info here...",
                issue_label: "Issue",
                issue_placeholder: "e.g. PMT belt jam",
                start_time_label: "Start time",
                start_btn: "START — IT'S DOWN NOW",
                save_btn: "Save Changes",
                start_hint: "Pick the affected area(s) below, paste the ticket, then hit Start. When the line is back up, tap Mark Fixed in the log and set the end time — the loss fills in automatically.",
                cancel_btn: "Cancel",
                inbound_pids_label: "Inbound Pids (Select All)",
                west_side_label: "West Side",
                east_side_label: "East Side",
                pid_label: "PID",
                pmt_label: "PMT",
                dd_label: "DD",
                pid_injection_label: "PID Injection",
                log_title: "Shift Event Log",
                copy_quip_btn: "Copy for Quip",
                clear_btn: "Clear",
                time_col: "Time",
                ticket_col: "Ticket / Issue",
                issue_col: "Issue",
                areas_col: "Areas",
                min_col: "Min",
                loss_col: "Loss",
                edit_col: "Edit",
                min_label: "MIN",
                running_label: "RUNNING",
                mark_fixed_btn: "Mark Fixed",
                end_time_label: "End time",
                placeholder_log: "No events logged yet.",
                total_loss_label: "Total Shift Loss",
                total_events_label: "Events:",
                total_downtime_label: "Total Downtime:",
                delete_title: "Confirm Delete",
                delete_msg: "Are you sure you want to remove this event?",
                confirm_delete_btn: "Delete",
                toast_copied: "Copied to Clipboard!",
                lang_btn_es: "Español",
                dark_mode_btn: "Dark Mode",
                light_mode_btn: "Light Mode",
                hints_label: "Display Hints",
                auto_update_label: "Auto Update",
                refresh_rate_label: "Refresh Rate",
                auto_update_hint: "When enabled, open events are re-estimated on the interval so running losses climb without touching closed events.",
                clock_sync_label: "Sync Start Time",
                clock_sync_hint: "Keeps the start-time box on current system time until you manually change it or edit an event.",
                presort_label: "Pre-Sort",
                presort_hint: "Pre-Sort has only two selectable lines: West and East. Each one counts as 1 of the 18 inbound lines. Hourly goal per pre-sort line = PID Goal ÷ 9 ÷ 18.",
                confirm_clear_title: "Confirm Clear Log",
                confirm_clear_msg: "Are you sure you want to clear the entire event log? This action cannot be undone.",
                confirm_clear_btn: "Clear All",
                quip_header: "Shift Event Log Summary",
                graph_title: "Projection History",
                graph_history_status_label: "History samples:",
                graph_record_now_btn: "Record Now",
                graph_clear_history_btn: "Clear History",
                shift_preset_label: "Shift",
                dayshift_option: "Days",
                nightshift_option: "Nights",
                ot_option_label: "O/T +1h",
                sample_interval_label: "Interval",
                shift_window_label: "Shift window:",
                not_wired_label: "Not Wired Yet",
                goal_pace_label: "Goal Pace",
                manual_pace_label: "Manual Pace",
                projected_delta_label: "Projected Delta",
                projected_finish_label: "Projected Finish",
                processed_label: "Processed",
                current_progress_label: "Current",
                worst_hit_label: "Worst Hit",
                goal_percent_label: "% To Goal",
                avg_1hr_loss_label: "Avg 1Hr Loss",
                avg_15m_loss_label: "Avg 15m Loss",
                location_impact_label: "Location Impact",
                top_three_label: "Top 3",
                loss_word: "loss",
                no_location_data: "No location data yet",
                projection_sketch_label: "projection sketch",
                export_btn: "Export",
                export_copy: "Copy",
                export_csv: "CSV",
                export_json: "JSON",
                export_markdown: "Markdown",
                data_mode_label: "Data Mode",
                manual_mode_label: "Manual",
                live_locked_label: "Live Locked",
                animations_label: "Animations",
                anim_off_label: "Off",
                anim_calm_label: "Calm",
                anim_snappy_label: "Snappy",
                anim_distract_label: "Distract me",
                layout_title: "Layout",
                layout_pg: "PG",
                layout_big_numbers: "Big Numbers",
                layout_log_heavy: "Log Heavy",
                layout_minimal: "Minimal",
                reset_layout_btn: "Reset Layout",
                personalization_title: "Personalization",
                name_station_label: "Name / station label",
                personal_name_placeholder: "e.g. Flow Desk, PID Deck, Noul",
                top_message_label: "Top-right message",
                personal_message_placeholder: "e.g. No guesswork. No mercy.",
                example_btn: "Example",
                clear_personal_btn: "Clear",
                hints_title: "Hints",
                hints_clean_note: "Off keeps the dashboard clean; hover the small ? markers for quick reminders.",
                layout_preset_applied_toast: "Layout preset applied.",
                layout_reset_toast: "Layout reset.",
                live_mode_locked_toast: "Live Mode locked. Manual Mode only for now.",
                live_mode_unlocked_toast: "Dev Live Mode shell unlocked. No polling is wired yet.",
                live_mode_hint_locked: "Secret dev unlock exists, but Manual Mode remains the only production-safe mode.",
                live_mode_hint_unlocked: "Dev shell unlocked. Still does not poll internal systems or store endpoints.",
                live_dev_shell_label: "Live Dev Shell",
                err_areas: "Please select at least one affected PID/PMT/DD below.",
                err_setup: "PID Goal and Shift Hours must be greater than 0.",
                about_kicker: "Version / Credits",
                about_title: "IBCL - Inbound Carton Loss",
                about_version_label: "Version",
                about_suite_label: "Flowin Operations Suite module",
                about_credits_label: "Credits",
                about_credit_original: "Original design and logic by erapower.",
                about_credit_overhaul: "V2 overhaul, dashboard framework, and addons by branasen.",
                about_note_label: "Note",
                about_note_text: "Unofficial local productivity tool. No credentials, tokens, or internal API keys are stored in this file.",
                about_close_btn: "Close",
            },
            es: {
                calc_title: "Calculadora de Pérdida de Cartones de Muelle de Entrada",
                calc_subtitle: "Configura los números del turno, selecciona el área afectada y comienza el evento.",
                live_metrics_label: "Vista Previa",
                metric_waiting: "Selecciona un área para ver la pérdida.",
                graph_hint: "Reservado para una vista futura de ritmo/proyección. Debe comparar meta, lecturas móviles de rendimiento de 15 minutos, pérdidas registradas y cualquier conteo oficial de cartones procesados si se encuentra una fuente limpia más adelante.",
                selected_label: "Selección",
                share_label: "Porción",
                hour_goal_label: "Meta 1 Hr",
                perf_basis_label: "Perf 15m",
                est_15_label: "Pérdida Est. 15 Min",
                active_loss_label: "Pérdida Activa",
                total_loss_short_label: "Pérdida Total",
                throughput_label: "Ritmo Manual",
                goal_delta_label: "Vs Meta",
                cb_label: "CrossBelt / CB",
                cb_hint: "Usa esto cuando CrossBelt está detenido. Selecciona todas las áreas PID y ambas líneas Pre-Sort.",
                cb_checkbox_label: "CB Caído - Seleccionar Todo",
                location_gate_hint: "Agrega detalles del ticket arriba para mostrar la selección de áreas.",
                pid_goal_label: "Meta PID",
                shift_hours_label: "Horas de Turno",
                performance_15_label: "Cartones 15 Min Ant.",
                ticket_label: "Ticket (pega el enlace)",
                ticket_placeholder: "Pegar info del ticket aquí...",
                issue_label: "Problema",
                issue_placeholder: "ej. atasco de banda PMT",
                start_time_label: "Hora de inicio",
                start_btn: "INICIAR — ESTÁ CAÍDO AHORA",
                save_btn: "Guardar Cambios",
                start_hint: "Selecciona el área(s) afectada(s) abajo, pega el ticket y presiona Iniciar. Cuando la línea vuelva, presiona Marcar Resuelto en el registro y pon la hora de fin — la pérdida se calcula sola.",
                cancel_btn: "Cancelar",
                inbound_pids_label: "PIDs de Entrada (Seleccionar Todo)",
                west_side_label: "Lado Oeste",
                east_side_label: "Lado Este",
                pid_label: "PID",
                pmt_label: "PMT",
                dd_label: "DD",
                pid_injection_label: "Inyección PID",
                log_title: "Registro de Eventos del Turno",
                copy_quip_btn: "Copiar para Quip",
                clear_btn: "Borrar",
                time_col: "Hora",
                ticket_col: "Ticket / Problema",
                issue_col: "Problema",
                areas_col: "Áreas",
                min_col: "Min",
                loss_col: "Pérdida",
                edit_col: "Editar",
                min_label: "MIN",
                running_label: "EN CURSO",
                mark_fixed_btn: "Marcar Resuelto",
                end_time_label: "Hora de fin",
                placeholder_log: "No se han registrado eventos todavía.",
                total_loss_label: "Pérdida Total del Turno",
                total_events_label: "Eventos:",
                total_downtime_label: "Tiempo Muerto Total:",
                delete_title: "Confirmar Borrar",
                delete_msg: "¿Estás seguro de que quieres eliminar este evento?",
                confirm_delete_btn: "Eliminar",
                toast_copied: "¡Copiado al Portapapeles!",
                lang_btn_es: "Ελληνικά",
                dark_mode_btn: "Modo Oscuro",
                light_mode_btn: "Modo Claro",
                hints_label: "Mostrar Ayudas",
                auto_update_label: "Auto Actualizar",
                refresh_rate_label: "Frecuencia",
                auto_update_hint: "Cuando está activo, los eventos abiertos se recalculan en intervalo para que la pérdida en curso aumente sin tocar eventos cerrados.",
                presort_label: "Pre-Sort",
                presort_hint: "Pre-Sort solo tiene dos líneas seleccionables: Oeste y Este. Cada una cuenta como 1 de las 18 líneas inbound. Meta por hora de cada línea pre-sort = Meta PID ÷ 9 ÷ 18.",
                confirm_clear_title: "Confirmar Borrar Registro",
                confirm_clear_msg: "¿Estás seguro de que quieres borrar todo el registro de eventos? Esta acción no se puede deshacer.",
                confirm_clear_btn: "Borrar Todo",
                quip_header: "Resumen del Registro de Eventos del Turno",
                graph_title: "Historial de Proyección",
                graph_history_status_label: "Muestras:",
                graph_record_now_btn: "Registrar Ahora",
                graph_clear_history_btn: "Borrar Historial",
                shift_preset_label: "Turno",
                dayshift_option: "Días",
                nightshift_option: "Noches",
                ot_option_label: "O/T +1h",
                sample_interval_label: "Intervalo",
                shift_window_label: "Ventana del turno:",
                not_wired_label: "No Conectado Aún",
                goal_pace_label: "Ritmo de Meta",
                manual_pace_label: "Ritmo Manual",
                projected_delta_label: "Diferencia Proyectada",
                worst_hit_label: "Mayor impacto",
                goal_percent_label: "% de meta",
                avg_1hr_loss_label: "Pérdida prom. 1h",
                avg_15m_loss_label: "Pérdida prom. 15m",
                location_impact_label: "Impacto por ubicación",
                top_three_label: "Top 3",
                loss_word: "pérdida",
                no_location_data: "Sin datos de ubicación",
                projection_sketch_label: "bosquejo de proyección",
                export_btn: "Exportar",
                export_copy: "Copiar",
                export_csv: "CSV",
                export_json: "JSON",
                export_markdown: "Markdown",
                data_mode_label: "Modo de Datos",
                manual_mode_label: "Manual",
                live_locked_label: "Live Bloqueado",
                animations_label: "Animaciones",
                anim_off_label: "Apagado",
                anim_calm_label: "Calma",
                anim_snappy_label: "Rápido",
                anim_distract_label: "Distráeme",
                layout_title: "Diseño",
                layout_pg: "PG",
                layout_big_numbers: "Números Grandes",
                layout_log_heavy: "Log Grande",
                layout_minimal: "Mínimo",
                reset_layout_btn: "Restablecer Diseño",
                personalization_title: "Personalización",
                name_station_label: "Nombre / estación",
                personal_name_placeholder: "ej. Flow Desk, PID Deck, Noul",
                top_message_label: "Mensaje superior derecho",
                personal_message_placeholder: "ej. Sin adivinar. Sin piedad.",
                example_btn: "Ejemplo",
                clear_personal_btn: "Limpiar",
                hints_title: "Ayudas",
                hints_clean_note: "Apagado mantiene limpio el panel; pasa el cursor sobre los ? para recordatorios rápidos.",
                layout_preset_applied_toast: "Diseño aplicado.",
                layout_reset_toast: "Diseño restablecido.",
                live_mode_locked_toast: "Live Mode bloqueado. Solo modo manual por ahora.",
                live_mode_unlocked_toast: "Shell dev Live desbloqueado. No hay polling conectado todavía.",
                live_mode_hint_locked: "Existe desbloqueo dev secreto, pero Manual sigue siendo el único modo seguro de producción.",
                live_mode_hint_unlocked: "Shell dev desbloqueado. Todavía no consulta sistemas internos ni guarda endpoints.",
                live_dev_shell_label: "Shell Dev Live",
                err_areas: "Por favor selecciona al menos un PID/PMT/DD afectado abajo.",
                err_setup: "Meta PID y Horas de Turno deben ser mayores a 0.",

            },
            el: {
                calc_title: "IBCL - Απώλεια Κιβωτίων Inbound",
                calc_subtitle: "Ορίστε τους αριθμούς βάρδιας, επιλέξτε την επηρεασμένη περιοχή και ξεκινήστε το συμβάν.",
                live_metrics_label: "Ζωντανή Προεπισκόπηση",
                metric_waiting: "Επιλέξτε περιοχή για προεπισκόπηση απώλειας.",
                graph_hint: "Κρατημένο για μελλοντική προβολή ρυθμού/πρόβλεψης. Θα συγκρίνει ρυθμό στόχου, κυλιόμενες μετρήσεις απόδοσης 15 λεπτών, καταγεγραμμένες απώλειες και οποιονδήποτε επίσημο αριθμό επεξεργασμένων κιβωτίων αν βρεθεί καθαρή πηγή αργότερα.",
                selected_label: "Επιλογές",
                share_label: "Μερίδιο",
                hour_goal_label: "Στόχος 1 Ώρας",
                perf_basis_label: "Απόδ. 15λ",
                est_15_label: "Εκτ. Απώλεια 15λ",
                active_loss_label: "Τρέχουσα Απώλεια",
                total_loss_short_label: "Σύνολο Απώλειας",
                throughput_label: "Χειροκίνητος Ρυθμός",
                goal_delta_label: "Έναντι Στόχου",
                cb_label: "CrossBelt / CB",
                cb_hint: "Χρησιμοποιήστε το όταν το CrossBelt είναι σταματημένο. Επιλέγει όλες τις περιοχές που συνδέονται με PID και τις δύο γραμμές Pre-Sort.",
                cb_checkbox_label: "CB Κάτω - Επιλογή Όλης της Ροής",
                location_gate_hint: "Προσθέστε στοιχεία ticket παραπάνω για να εμφανιστεί η επιλογή επηρεασμένης περιοχής.",
                pid_goal_label: "Στόχος PID",
                shift_hours_label: "Ώρες Βάρδιας",
                performance_15_label: "Κιβώτια Προηγ. 15λ",
                ticket_label: "Ticket (επικόλληση συνδέσμου)",
                ticket_placeholder: "Επικολλήστε πληροφορίες ticket εδώ...",
                issue_label: "Πρόβλημα",
                issue_placeholder: "π.χ. εμπλοκή ιμάντα PMT",
                start_time_label: "Ώρα έναρξης",
                start_btn: "ΕΝΑΡΞΗ — ΕΙΝΑΙ ΚΑΤΩ ΤΩΡΑ",
                save_btn: "Αποθήκευση Αλλαγών",
                start_hint: "Επιλέξτε τις επηρεασμένες περιοχές, επικολλήστε το ticket και πατήστε Έναρξη. Όταν η γραμμή επανέλθει, πατήστε Mark Fixed στο log και ορίστε ώρα λήξης — η απώλεια συμπληρώνεται αυτόματα.",
                cancel_btn: "Άκυρο",
                inbound_pids_label: "Inbound PIDs (Επιλογή Όλων)",
                west_side_label: "Δυτική Πλευρά",
                east_side_label: "Ανατολική Πλευρά",
                pid_label: "PID",
                pmt_label: "PMT",
                dd_label: "DD",
                pid_injection_label: "Έγχυση PID",
                log_title: "Log Συμβάντων Βάρδιας",
                copy_quip_btn: "Αντιγραφή για Quip",
                clear_btn: "Καθαρισμός",
                time_col: "Ώρα",
                ticket_col: "Ticket / Πρόβλημα",
                issue_col: "Πρόβλημα",
                areas_col: "Περιοχές",
                min_col: "Λεπτά",
                loss_col: "Απώλεια",
                edit_col: "Επεξ.",
                min_label: "ΛΕΠΤΑ",
                running_label: "ΣΕ ΕΞΕΛΙΞΗ",
                mark_fixed_btn: "Mark Fixed",
                end_time_label: "Ώρα λήξης",
                placeholder_log: "Δεν υπάρχουν καταγεγραμμένα συμβάντα ακόμα.",
                total_loss_label: "Συνολική Απώλεια Βάρδιας",
                total_events_label: "Συμβάντα:",
                total_downtime_label: "Συνολικό Downtime:",
                delete_title: "Επιβεβαίωση Διαγραφής",
                delete_msg: "Θέλετε σίγουρα να αφαιρέσετε αυτό το συμβάν;",
                confirm_delete_btn: "Διαγραφή",
                toast_copied: "Αντιγράφηκε στο πρόχειρο!",
                lang_btn_es: "English",
                dark_mode_btn: "Σκοτεινή Λειτουργία",
                light_mode_btn: "Φωτεινή Λειτουργία",
                hints_label: "Εμφάνιση Βοηθειών",
                auto_update_label: "Αυτόματη Ενημέρωση",
                refresh_rate_label: "Ρυθμός Ανανέωσης",
                auto_update_hint: "Όταν είναι ενεργό, τα ανοιχτά συμβάντα επανυπολογίζονται στο επιλεγμένο διάστημα ώστε η τρέχουσα απώλεια να αυξάνεται χωρίς αλλαγή κλειστών συμβάντων.",
                clock_sync_label: "Συγχρονισμός Ώρας Έναρξης",
                clock_sync_hint: "Κρατά το πεδίο ώρας έναρξης στην τρέχουσα ώρα συστήματος μέχρι να το αλλάξετε χειροκίνητα ή να επεξεργαστείτε συμβάν.",
                presort_label: "Pre-Sort",
                presort_hint: "Το Pre-Sort έχει μόνο δύο επιλέξιμες γραμμές: Δυτική και Ανατολική. Η καθεμία μετρά ως 1 από τις 18 inbound γραμμές. Ωριαίος στόχος ανά γραμμή pre-sort = Στόχος PID ÷ 9 ÷ 18.",
                confirm_clear_title: "Επιβεβαίωση Καθαρισμού Log",
                confirm_clear_msg: "Θέλετε σίγουρα να καθαρίσετε ολόκληρο το log συμβάντων; Αυτή η ενέργεια δεν αναιρείται.",
                confirm_clear_btn: "Καθαρισμός Όλων",
                quip_header: "Σύνοψη Log Συμβάντων Βάρδιας",
                graph_title: "Ιστορικό Πρόβλεψης",
                graph_history_status_label: "Δείγματα:",
                graph_record_now_btn: "Καταγραφή Τώρα",
                graph_clear_history_btn: "Εκκαθάριση Ιστορικού",
                shift_preset_label: "Βάρδια",
                dayshift_option: "Ημέρες",
                nightshift_option: "Νύχτες",
                ot_option_label: "Υπερωρία +1ω",
                sample_interval_label: "Διάστημα",
                shift_window_label: "Παράθυρο βάρδιας:",
                not_wired_label: "Δεν Έχει Συνδεθεί Ακόμα",
                goal_pace_label: "Ρυθμός Στόχου",
                manual_pace_label: "Χειροκίνητος Ρυθμός",
                projected_delta_label: "Προβλεπόμενη Διαφορά",
                projected_finish_label: "Προβλεπόμενο Τέλος",
                processed_label: "Επεξεργασμένα",
                current_progress_label: "Τρέχον",
                worst_hit_label: "Μεγαλύτερο πλήγμα",
                goal_percent_label: "% στόχου",
                avg_1hr_loss_label: "Μέση απώλεια 1ώ",
                avg_15m_loss_label: "Μέση απώλεια 15λ",
                location_impact_label: "Επίπτωση ανά θέση",
                top_three_label: "Top 3",
                loss_word: "απώλεια",
                no_location_data: "Δεν υπάρχουν δεδομένα θέσης",
                projection_sketch_label: "σκίτσο πρόβλεψης",
                export_btn: "Εξαγωγή",
                export_copy: "Αντιγραφή",
                export_csv: "CSV",
                export_json: "JSON",
                export_markdown: "Markdown",
                data_mode_label: "Λειτουργία Δεδομένων",
                manual_mode_label: "Χειροκίνητο",
                live_locked_label: "Live Κλειδωμένο",
                animations_label: "Κινήσεις",
                anim_off_label: "Κλειστό",
                anim_calm_label: "Ήρεμο",
                anim_snappy_label: "Γρήγορο",
                anim_distract_label: "Απόσπασέ με",
                layout_title: "Διάταξη",
                layout_pg: "PG",
                layout_big_numbers: "Μεγάλοι Αριθμοί",
                layout_log_heavy: "Μεγάλο Log",
                layout_minimal: "Ελάχιστο",
                reset_layout_btn: "Επαναφορά Διάταξης",
                personalization_title: "Προσωποποίηση",
                name_station_label: "Όνομα / σταθμός",
                personal_name_placeholder: "π.χ. Flow Desk, PID Deck, Noul",
                top_message_label: "Μήνυμα πάνω δεξιά",
                personal_message_placeholder: "π.χ. Χωρίς μαντεψιές. Χωρίς έλεος.",
                example_btn: "Παράδειγμα",
                clear_personal_btn: "Καθαρισμός",
                hints_title: "Βοήθειες",
                hints_clean_note: "Κλειστό κρατά το dashboard καθαρό· περάστε πάνω από τα μικρά ? για γρήγορες υπενθυμίσεις.",
                layout_preset_applied_toast: "Η διάταξη εφαρμόστηκε.",
                layout_reset_toast: "Η διάταξη επαναφέρθηκε.",
                live_mode_locked_toast: "Το Live Mode είναι κλειδωμένο. Μόνο χειροκίνητο προς το παρόν.",
                live_mode_unlocked_toast: "Το dev shell Live ξεκλειδώθηκε. Δεν υπάρχει polling ακόμα.",
                live_mode_hint_locked: "Υπάρχει μυστικό dev unlock, αλλά το Χειροκίνητο παραμένει η μόνη ασφαλής παραγωγική λειτουργία.",
                live_mode_hint_unlocked: "Το dev shell ξεκλειδώθηκε. Ακόμα δεν διαβάζει εσωτερικά συστήματα ούτε αποθηκεύει endpoints.",
                live_dev_shell_label: "Live Dev Shell",
                err_areas: "Παρακαλώ επιλέξτε τουλάχιστον ένα επηρεασμένο PID/PMT/DD παρακάτω.",
                err_setup: "Ο Στόχος PID και οι Ώρες Βάρδιας πρέπει να είναι πάνω από 0.",
            }
        };

        function getLang() { return translations[currentLang] || translations.en; }

        function applyTranslations() {
            const lang = getLang();
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (lang[key]) el.textContent = lang[key];
            });
            document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                if (lang[key]) el.placeholder = lang[key];
            });
            const langBtn = document.getElementById('langToggleBtn').querySelector('span');
            langBtn.textContent = translations[currentLang]?.lang_btn_es || 'Español';
            updateDarkModeButton();
            if (typeof updateLiveModeShell === 'function') updateLiveModeShell();
            if (typeof setAnimationLevel === 'function') { const slider = document.getElementById('animationSlider'); if (slider) setAnimationLevel(slider.value); }
        }

        function toggleSettingsMenu() {
            const panel = document.getElementById('settingsMenuPanel');
            if (!panel) return;
            panel.classList.toggle('hidden');
        }

        function closeSettingsMenu() {
            const panel = document.getElementById('settingsMenuPanel');
            if (!panel) return;
            panel.classList.add('hidden');
        }

        function openIBCLAbout() {
            const modal = document.getElementById('aboutModal');
            if (!modal) return;
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }

        function closeIBCLAbout() {
            const modal = document.getElementById('aboutModal');
            if (!modal) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }

        function updateDarkModeButton() {
            const btn = document.getElementById('darkModeToggleBtn');
            if (!btn) return;
            const icon = btn.querySelector('i');
            const span = btn.querySelector('span');
            const lang = getLang();
            const dark = document.body.classList.contains('dark');
            if (icon) icon.className = dark ? 'fas fa-sun mr-1' : 'fas fa-moon mr-1';
            if (span) span.textContent = dark ? lang.light_mode_btn : lang.dark_mode_btn;
        }

        function toggleDarkMode() {
            document.body.classList.toggle('dark');
            updateDarkModeButton();
            saveState();
        }

        function setupAutoUpdateControls() {
            const toggle = document.getElementById('autoUpdateToggle');
            const slider = document.getElementById('autoUpdateInterval');
            const display = document.getElementById('autoUpdateSecondsDisplay');
            if (toggle) toggle.checked = autoUpdateEnabled;
            if (slider) slider.value = autoUpdateIntervalSeconds;
            if (display) display.textContent = autoUpdateIntervalSeconds;
            scheduleAutoUpdate();
        }

        function setAutoUpdate(enabled) {
            autoUpdateEnabled = !!enabled;
            scheduleAutoUpdate();
            renderEventLog();
            saveState();
        }

        function setAutoUpdateInterval(seconds) {
            autoUpdateIntervalSeconds = Number(seconds) || 60;
            const display = document.getElementById('autoUpdateSecondsDisplay');
            if (display) display.textContent = autoUpdateIntervalSeconds;
            scheduleAutoUpdate();
            saveState();
        }

        function scheduleAutoUpdate() {
            if (autoUpdateTimer) clearInterval(autoUpdateTimer);
            autoUpdateTimer = null;
            if (!autoUpdateEnabled) return;
            autoUpdateTimer = setInterval(() => {
                calculateLivePreview();
                renderEventLog();
            }, autoUpdateIntervalSeconds * 1000);
        }

        function setupStartTimeSync() {
            const input = document.getElementById('startTimeInput');
            const toggle = document.getElementById('startTimeSyncToggle');
            if (toggle) toggle.checked = startTimeAutoSync;
            if (!input) return;
            if (!input.dataset.syncBound) {
                input.addEventListener('input', () => { startTimeManuallyEdited = true; });
                input.addEventListener('change', () => { startTimeManuallyEdited = true; });
                input.dataset.syncBound = 'true';
            }
            scheduleStartTimeSync();
        }

        function setStartTimeAutoSync(enabled) {
            startTimeAutoSync = !!enabled;
            if (startTimeAutoSync) {
                startTimeManuallyEdited = false;
                syncStartTimeToNow(true);
            }
            scheduleStartTimeSync();
            saveState();
        }

        function syncStartTimeToNow(force = false) {
            const input = document.getElementById('startTimeInput');
            if (!input || editingId !== null) return;
            if (!startTimeAutoSync) return;
            if (!force && startTimeManuallyEdited) return;
            if (!force && document.activeElement === input) return;
            input.value = nowHM();
        }

        function scheduleStartTimeSync() {
            if (startTimeSyncTimer) clearInterval(startTimeSyncTimer);
            startTimeSyncTimer = null;
            if (!startTimeAutoSync) return;
            syncStartTimeToNow(true);
            startTimeSyncTimer = setInterval(() => syncStartTimeToNow(false), 5000);
        }

        function toggleLanguage() {
            const order = ['en', 'es', 'el'];
            const idx = order.indexOf(currentLang);
            currentLang = order[(idx + 1) % order.length];
            localStorage.setItem('ibcl_language_v2', currentLang);
            document.documentElement.lang = currentLang;
            applyTranslations();
            updateDarkModeButton();
            calculateLivePreview();
            renderEventLog();
            renderGraphPlaceholder();
        }

        function initApp() {
            currentLang = localStorage.getItem('ibcl_language_v2') || currentLang;
            document.documentElement.lang = currentLang;
            loadState();
            events.forEach(recompute);
            const sti = document.getElementById('startTimeInput');
            if (sti && !sti.value) sti.value = nowHM();
            applyTranslations();
            handleDetailsGate();
            setupAutoUpdateControls();
            setupStartTimeSync();
            loadProjectionSettings();
            calculateLivePreview();
            renderEventLog();
            renderGraphPlaceholder();
        }
        document.addEventListener('DOMContentLoaded', initApp);

        // Keep pop-out/card-only windows synchronized with the main operator view.
        // localStorage changes in one tab/window fire this event in the others.
        window.addEventListener('storage', (event) => {
            const keysToWatch = new Set([
                STORAGE_KEY,
                'ibcl_projection_history_v2',
                'ibcl_projection_settings_v2',
                'ibcl_personalization_v2',
                'ibcl_show_hints_v2',
                'ibcl_language_v2'
            ]);
            if (!keysToWatch.has(event.key)) return;
            loadState();
            if (typeof loadProjectionSettings === 'function') loadProjectionSettings();
            if (typeof setupProjectionControls === 'function') setupProjectionControls();
            if (typeof calculateLivePreview === 'function') calculateLivePreview();
            if (typeof renderEventLog === 'function') renderEventLog();
            if (typeof renderProjectionHistory === 'function') renderProjectionHistory();
            if (typeof renderProjectedFinishBars === 'function') renderProjectedFinishBars();
            if (typeof applyTranslations === 'function') applyTranslations();
        });


        /*
        ========================================================================
        09. CHECKBOX BEHAVIOR
        ========================================================================
        */
        function toggleGroup(checkbox, groupId) {
            const group = document.getElementById(groupId);
            if (!group) return;
            group.querySelectorAll('.option-check').forEach(c => { c.checked = checkbox.checked; });
            calculateLivePreview();
        }
        function toggleAll(checkbox) {
            document.querySelectorAll('.sub-heading, .sub-sub-heading, .option-check').forEach(c => { c.checked = checkbox.checked; });
            const cb = document.getElementById('cb-check');
            if (cb) cb.checked = checkbox.checked && Array.from(document.querySelectorAll('.option-check')).every(c => c.checked);
            calculateLivePreview();
        }

        function toggleCrossBelt(checkbox) {
            document.querySelectorAll('.sub-heading, .sub-sub-heading, .option-check, #main-check, #presort-check').forEach(c => { c.checked = checkbox.checked; });
            calculateLivePreview();
        }

        function handleDetailsGate() {
            const ticket = (document.getElementById('ticketInput')?.value || '').trim();
            const gate = document.getElementById('affectedAreaGate');
            const hint = document.getElementById('locationGateHint');
            const open = ticket.length > 0;
            if (gate) gate.classList.toggle('hidden', !open);
            if (hint) hint.classList.toggle('hidden', open);
            if (!open) {
                document.querySelectorAll('.sub-heading, .sub-sub-heading, .option-check, #main-check, #presort-check, #cb-check').forEach(c => { c.checked = false; });
                calculateLivePreview();
            }
        }

        /*
        ========================================================================
        10. LIVE PREVIEW METRICS
        ------------------------------------------------------------------------
        Updates the right-side metrics panel without creating a log event.
        ========================================================================
        */
        function fmtNum(n) { return Math.round(n || 0).toLocaleString(); }

        function getLiveEventImpactStats() {
            const areaTotals = {};
            let totalLoss = 0;
            let totalDowntime = 0;
            events.forEach(event => {
                const isRunning = event.open || !event.endTime;
                const dt = isRunning ? minutesBetween(event.startTime, nowHM()) : (event.downtime || 0);
                const calc = isRunning
                    ? computeLossValues(dt, event.weight, event.pidGoal, event.shiftHours, event.perf15, event.presortCount || 0)
                    : event;
                const loss = calc.loss || 0;
                totalLoss += loss;
                totalDowntime += dt || 0;
                const areas = Array.isArray(event.areas) ? event.areas : [];
                const splitLoss = areas.length ? loss / areas.length : 0;
                areas.forEach(area => {
                    if (!areaTotals[area]) areaTotals[area] = { area, loss: 0, events: 0, minutes: 0 };
                    areaTotals[area].loss += splitLoss;
                    areaTotals[area].events += 1;
                    areaTotals[area].minutes += dt || 0;
                });
            });
            const areas = Object.values(areaTotals).sort((a, b) => b.loss - a.loss);
            return { areas, totalLoss, totalDowntime };
        }

        function updateImpactMetrics(totalLoss = 0) {
            const lang = getLang();
            const stats = getLiveEventImpactStats();
            const loss = totalLoss || stats.totalLoss || 0;
            const downtime = stats.totalDowntime || 0;
            const pidGoal = parseFloat(document.getElementById('pidGoal')?.value) || 0;
            const shiftHours = parseFloat(document.getElementById('shiftHours')?.value) || 0;
            const perf15 = parseFloat(document.getElementById('perf15')?.value) || 0;
            const manualPace = perf15 > 0 ? perf15 * 4 : 0;
            const projectedTotal = Math.max(0, (manualPace * shiftHours) - loss);
            const goalPercent = pidGoal > 0 ? (projectedTotal / pidGoal) * 100 : 0;
            const avg1Hr = downtime > 0 ? (loss / downtime) * 60 : 0;
            const avg15 = downtime > 0 ? (loss / downtime) * 15 : 0;
            const worst = stats.areas[0];

            const worstEl = document.getElementById('metricWorstHit');
            const worstLossEl = document.getElementById('metricWorstHitLoss');
            const goalPctEl = document.getElementById('metricGoalPercent');
            const avg1El = document.getElementById('metricAvg1HrLoss');
            const avg15El = document.getElementById('metricAvg15Loss');
            const listEl = document.getElementById('metricLocationImpactList');

            if (worstEl) worstEl.textContent = worst ? worst.area : '—';
            if (worstLossEl) worstLossEl.textContent = worst ? `${fmtNum(worst.loss)} ${lang.loss_word || 'loss'}` : `0 ${lang.loss_word || 'loss'}`;
            if (goalPctEl) {
                goalPctEl.textContent = pidGoal > 0 ? `${goalPercent.toFixed(1).replace('.0', '')}%` : '0%';
                goalPctEl.className = 'text-2xl font-black tracking-tight ' + (goalPercent >= 100 ? 'text-emerald-300' : goalPercent >= 90 ? 'text-yellow-300' : 'text-red-300');
            }
            if (avg1El) avg1El.textContent = fmtNum(avg1Hr);
            if (avg15El) avg15El.textContent = fmtNum(avg15);
            if (listEl) {
                if (!stats.areas.length) {
                    listEl.textContent = lang.no_location_data || 'No location data yet';
                } else {
                    listEl.innerHTML = stats.areas.slice(0, 3).map((row, idx) => `
                        <div class="flex items-center justify-between gap-2">
                            <span class="truncate"><span class="text-slate-500 font-black mr-1">${idx + 1}</span>${row.area}</span>
                            <span class="font-black text-yellow-300 whitespace-nowrap">${fmtNum(row.loss)}</span>
                        </div>
                    `).join('');
                }
            }
        }

        function updateLossSummary(activeLoss = 0, totalLoss = 0) {
            const activeEl = document.getElementById('metricActiveLoss');
            const totalEl = document.getElementById('metricTotalLoss');
            if (activeEl) activeEl.textContent = fmtNum(activeLoss);
            if (totalEl) totalEl.textContent = fmtNum(totalLoss);
            updateImpactMetrics(totalLoss);
            if (typeof updateThroughputAndProjection === 'function') updateThroughputAndProjection(activeLoss, totalLoss);
        }
        function calculateLivePreview() {
            const checkedOptions = Array.from(document.querySelectorAll('.option-check:checked'));
            const pidGoal = parseFloat(document.getElementById('pidGoal').value) || 0;
            const shiftHours = parseFloat(document.getElementById('shiftHours').value) || 0;
            const perf15 = parseFloat(document.getElementById('perf15').value) || 0;
            const normalWeight = checkedOptions
                .filter(c => c.dataset.mode !== 'presort')
                .reduce((s, c) => s + (parseFloat(c.dataset.weight) || 0), 0);
            const presortCount = checkedOptions.filter(c => c.dataset.mode === 'presort').length;
            const selectedCount = checkedOptions.length;
            const effectiveShare = normalWeight + (presortCount / PRESORT_PERF_DIVISOR);
            const hour = computeLossValues(60, normalWeight, pidGoal, shiftHours, perf15, presortCount);
            const fifteen = computeLossValues(15, normalWeight, pidGoal, shiftHours, perf15, presortCount);

            const selectedEl = document.getElementById('metricSelected');
            const weightEl = document.getElementById('metricWeight');
            const goalEl = document.getElementById('metricGoalHour');
            const perfEl = document.getElementById('metricPerf15');
            const estEl = document.getElementById('metricEst15');
            const basisEl = document.getElementById('metricBasis');
            if (selectedEl) selectedEl.textContent = selectedCount;
            if (weightEl) weightEl.textContent = (effectiveShare * 100).toFixed(1).replace('.0', '') + '%';
            if (goalEl) goalEl.textContent = fmtNum(hour.goalLoss);
            if (perfEl) perfEl.textContent = fmtNum(fifteen.perfLoss);
            if (estEl) estEl.textContent = fmtNum(fifteen.loss);
            if (basisEl) {
                const cb = document.getElementById('cb-check');
                const cbOn = cb && cb.checked;
                if (cbOn) basisEl.textContent = 'CrossBelt / CB selected';
                else if (!selectedCount) basisEl.textContent = "";
                else if (presortCount && normalWeight) basisEl.textContent = 'PID/DD + Pre-Sort blend';
                else if (presortCount) basisEl.textContent = presortCount === 1 ? '1 Pre-Sort line selected' : '2 Pre-Sort lines selected';
                else basisEl.textContent = selectedCount === 1 ? '1 PID area selected' : `${selectedCount} PID areas selected`;
            }
            const cb = document.getElementById('cb-check');
            if (cb) cb.checked = selectedCount > 0 && selectedCount === document.querySelectorAll('.option-check').length;
            if (typeof updateThroughputAndProjection === 'function') {
                const totalText = (document.getElementById('metricTotalLoss')?.textContent || '0').replace(/,/g, '');
                const activeText = (document.getElementById('metricActiveLoss')?.textContent || '0').replace(/,/g, '');
                updateThroughputAndProjection(parseFloat(activeText) || 0, parseFloat(totalText) || 0);
            }
            saveState();
        }


        /*
        ========================================================================
        11. EVENT LIFECYCLE
        ------------------------------------------------------------------------
        Start event, mark fixed, edit, cancel, and reset form state.
        ========================================================================
        */
        function showErr(msg) {
            const e = document.getElementById('errorMsg');
            e.textContent = msg;
            e.classList.remove('hidden');
        }

        function startEvent() {
            document.getElementById('errorMsg').classList.add('hidden');
            const checkedOptions = Array.from(document.querySelectorAll('.option-check:checked'));
            const pidGoal = parseFloat(document.getElementById('pidGoal').value) || 0;
            const shiftHours = parseFloat(document.getElementById('shiftHours').value) || 0;
            const perf15 = parseFloat(document.getElementById('perf15').value) || 0;
            const ticket = document.getElementById('ticketInput').value.trim();
            const issue = document.getElementById('issueInput').value.trim();
            if (startTimeAutoSync && !startTimeManuallyEdited && editingId === null) syncStartTimeToNow(true);
            const startTime = document.getElementById('startTimeInput').value || nowHM();

            if (checkedOptions.length === 0) { showErr(getLang().err_areas); return; }
            if (pidGoal <= 0 || shiftHours <= 0) { showErr(getLang().err_setup); return; }

            const weight = checkedOptions
                .filter(c => c.dataset.mode !== 'presort')
                .reduce((s, c) => s + parseFloat(c.dataset.weight || '0'), 0);
            const presortCount = checkedOptions.filter(c => c.dataset.mode === 'presort').length;
            const areas = checkedOptions.map(c => c.dataset.id);

            if (editingId !== null) {
                const ev = events.find(e => e.id === editingId);
                if (ev) {
                    ev.startTime = startTime; ev.ticket = ticket; ev.issue = issue;
                    ev.areas = areas; ev.weight = weight; ev.presortCount = presortCount;
                    ev.pidGoal = pidGoal; ev.shiftHours = shiftHours; ev.perf15 = perf15;
                    recompute(ev);
                }
                editingId = null;
                document.getElementById('cancelEditBtn').classList.add('hidden');
            } else {
                events.push({
                    id: Date.now(), startTime, endTime: null, open: true,
                    ticket, issue, areas, weight, presortCount,
                    pidGoal, shiftHours, perf15,
                    downtime: 0, goalLoss: 0, perfLoss: 0, loss: 0
                });
            }
            resetInputs();
            renderEventLog();
        }

        function markFixed(id) {
            const ev = events.find(e => e.id === id);
            if (!ev) return;
            ev.endTime = nowHM();
            ev.open = false;
            recompute(ev);
            renderEventLog();
        }

        function updateEventTime(id, which, val) {
            const ev = events.find(e => e.id === id);
            if (!ev) return;
            if (which === 'start') {
                ev.startTime = val || ev.startTime;
            } else {
                if (val) { ev.endTime = val; ev.open = false; }
                else { ev.endTime = null; ev.open = true; }
            }
            recompute(ev);
            renderEventLog();
        }

        function resetInputs() {
            document.getElementById('ticketInput').value = '';
            document.getElementById('issueInput').value = '';
            startTimeManuallyEdited = false;
            document.getElementById('startTimeInput').value = nowHM();
            scheduleStartTimeSync();
            document.querySelectorAll('.option-check').forEach(c => c.checked = false);
            document.querySelectorAll('.sub-heading, .sub-sub-heading, #main-check, #presort-check, #cb-check').forEach(c => c.checked = false);
            const btn = document.getElementById('addEventBtn');
            btn.innerHTML = `<i class="fas fa-play"></i> <span data-i18n="start_btn">${getLang().start_btn}</span>`;
            btn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
            btn.classList.add('bg-red-600', 'hover:bg-red-700');
            handleDetailsGate();
            calculateLivePreview();
        }

        function editEvent(id) {
            const ev = events.find(e => e.id === id);
            if (!ev) return;
            editingId = id;
            startTimeManuallyEdited = true;
            document.getElementById('pidGoal').value = ev.pidGoal;
            document.getElementById('shiftHours').value = ev.shiftHours;
            document.getElementById('perf15').value = ev.perf15;
            document.getElementById('startTimeInput').value = ev.startTime;
            document.getElementById('ticketInput').value = ev.ticket || '';
            document.getElementById('issueInput').value = ev.issue || '';
            handleDetailsGate();
            document.querySelectorAll('.option-check').forEach(c => c.checked = false);
            (ev.areas || []).forEach(a => {
                const cb = document.querySelector(`.option-check[data-id="${a}"]`);
                if (cb) cb.checked = true;
            });
            const btn = document.getElementById('addEventBtn');
            btn.innerHTML = `<i class="fas fa-save"></i> <span data-i18n="save_btn">${getLang().save_btn}</span>`;
            btn.classList.remove('bg-red-600', 'hover:bg-red-700');
            btn.classList.add('bg-blue-600', 'hover:bg-blue-700');
            document.getElementById('cancelEditBtn').classList.remove('hidden');
            calculateLivePreview();
            document.querySelector('.w-full.xl\\:w-5\\/12').scrollIntoView({ behavior: 'smooth' });
        }

        function cancelEdit() {
            editingId = null;
            resetInputs();
            document.getElementById('cancelEditBtn').classList.add('hidden');
        }


        /*
        ========================================================================
        12. EVENT LOG RENDERING
        ========================================================================
        */
        function renderEventLog() {
            saveState();
            const logBody = document.getElementById('eventLogBody');
            const lang = getLang();
            logBody.innerHTML = '';
            if (events.length === 0) {
                logBody.innerHTML = `<div class="text-center text-slate-400 mt-10 italic text-sm">${lang.placeholder_log}</div>`;
                document.getElementById('grandTotalDisplay').textContent = 0;
                document.getElementById('totalEventsCount').textContent = 0;
                document.getElementById('totalDowntimeDisplay').textContent = 0;
                updateLossSummary(0, 0);
                return;
            }
            let grandTotalLoss = 0, totalDowntime = 0, activeLoss = 0;
            events.sort((a, b) => a.id - b.id);
            const openEv = events.filter(e => e.open || !e.endTime);
            const closedEv = events.filter(e => !(e.open || !e.endTime));

            [...openEv, ...closedEv].forEach(event => {
                const isRunning = event.open || !event.endTime;
                const liveDowntime = isRunning ? minutesBetween(event.startTime, nowHM()) : event.downtime;
                const liveCalc = isRunning ? computeLossValues(liveDowntime, event.weight, event.pidGoal, event.shiftHours, event.perf15, event.presortCount || 0) : event;
                const liveLoss = liveCalc.loss || 0;
                grandTotalLoss += liveLoss;
                if (isRunning) activeLoss += liveLoss;
                totalDowntime += liveDowntime || 0;
                const t = parseTicket(event.ticket);
                const titleShort = t.title.substring(0, 36) + (t.title.length > 36 ? '...' : '');
                const ticketHtml = t.url
                    ? `<a href="${t.url}" target="_blank" rel="noopener" class="text-blue-600 hover:underline font-medium" title="${t.title}">${titleShort} <i class="fas fa-external-link-alt text-[9px]"></i></a>`
                    : `<span class="font-medium" title="${t.title}">${titleShort}</span>`;
                const issueHtml = event.issue ? `<div class="text-slate-500 text-[11px] truncate" title="${event.issue}">${event.issue}</div>` : '';
                const areasTooltip = event.areas.join(', ');
                const areasHtml = event.areas.slice(0, 3).join(', ') + (event.areas.length > 3 ? ` (+${event.areas.length - 3})` : '');

                const row = document.createElement('div');
                if (isRunning) {
                    row.className = 'ibcl-log-row-running p-2 bg-red-50 rounded-lg shadow-sm text-xs border-l-4 border-red-500';
                    row.innerHTML = `
                        <span class="font-bold text-red-600 uppercase flex items-center gap-1 shrink-0"><i class="fas fa-circle text-[7px] animate-pulse"></i> ${lang.running_label}</span>
                        <input type="time" value="${event.startTime}" onchange="updateEventTime(${event.id},'start',this.value)" class="border border-slate-300 rounded px-1 py-0.5 font-mono text-xs shrink-0" title="${lang.start_time_label}">
                        <div class="ibcl-log-ticket">${ticketHtml}${issueHtml}<div class="text-blue-600 truncate" title="${areasTooltip}">${areasHtml}</div><div class="text-[11px] text-yellow-600 font-bold">LIVE: ${liveDowntime} min • ${fmtNum(liveCalc.loss)} loss</div></div>
                        <input type="time" value="" onchange="updateEventTime(${event.id},'end',this.value)" class="border border-slate-300 rounded px-1 py-0.5 font-mono text-xs shrink-0" title="${lang.end_time_label}">
                        <button onclick="markFixed(${event.id})" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2 py-1 rounded shrink-0"><i class="fas fa-check"></i> ${lang.mark_fixed_btn}</button>
                        <button onclick="editEvent(${event.id})" class="text-blue-500 hover:text-blue-700 shrink-0"><i class="fas fa-edit"></i></button>
                        <button onclick="requestDeleteEvent(${event.id})" class="text-red-500 hover:text-red-700 shrink-0"><i class="fas fa-trash-alt"></i></button>
                    `;
                } else {
                    const method = event.perfLoss >= event.goalLoss ? 'P' : 'G';
                    const methodColor = method === 'P' ? 'text-yellow-600' : 'text-blue-600';
                    row.className = 'ibcl-log-row-closed p-2 bg-white rounded-lg shadow-sm text-sm border-l-4 border-emerald-400 hover:shadow-md transition';
                    row.innerHTML = `
                        <div class="col-span-2 flex flex-col gap-0.5">
                            <input type="time" value="${event.startTime}" onchange="updateEventTime(${event.id},'start',this.value)" class="border border-slate-200 rounded px-1 py-0.5 font-mono text-[11px] w-full">
                            <input type="time" value="${event.endTime}" onchange="updateEventTime(${event.id},'end',this.value)" class="border border-slate-200 rounded px-1 py-0.5 font-mono text-[11px] w-full">
                        </div>
                        <div class="ibcl-log-ticket text-xs text-slate-700">${ticketHtml}${issueHtml}</div>
                        <div class="ibcl-log-areas text-xs text-blue-600 cursor-help" title="${areasTooltip}">${areasHtml}</div>
                        <div class="text-xs font-semibold text-slate-600">${event.downtime}</div>
                        <div class="text-right text-base font-bold text-slate-800 whitespace-nowrap">${event.loss.toLocaleString()} <span class="text-[9px] ${methodColor} font-bold align-top" title="Higher of Performance/Goal drove this number">${method}</span></div>
                        <div class="text-right space-x-1 whitespace-nowrap">
                            <button onclick="editEvent(${event.id})" class="text-blue-500 hover:text-blue-700 text-sm"><i class="fas fa-edit"></i></button>
                            <button onclick="requestDeleteEvent(${event.id})" class="text-red-500 hover:text-red-700 text-sm"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    `;
                }
                logBody.appendChild(row);
            });

            document.getElementById('grandTotalDisplay').textContent = grandTotalLoss.toLocaleString();
            document.getElementById('totalEventsCount').textContent = events.length;
            document.getElementById('totalDowntimeDisplay').textContent = totalDowntime;
            updateLossSummary(activeLoss, grandTotalLoss);
        }


        /*
        ========================================================================
        13. MODAL / DELETE / CLEAR ACTIONS
        ========================================================================
        */
        function openModal() { document.getElementById('confirmModal').classList.remove('hidden'); }
        function closeModal() {
            document.getElementById('confirmModal').classList.add('hidden');
            itemToDeleteId = null; isClearAll = false;
        }
        function requestDeleteEvent(id) {
            itemToDeleteId = id; isClearAll = false;
            document.getElementById('modalTitle').textContent = getLang().delete_title;
            document.getElementById('modalMessage').textContent = getLang().delete_msg;
            const b = document.getElementById('modalConfirmBtn');
            b.textContent = getLang().confirm_delete_btn;
            b.onclick = deleteEvent;
            b.className = 'px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 font-semibold';
            openModal();
        }
        function deleteEvent() {
            events = events.filter(e => e.id !== itemToDeleteId);
            renderEventLog(); closeModal(); itemToDeleteId = null;
        }
        function requestClearLog() {
            if (events.length === 0) return;
            isClearAll = true;
            document.getElementById('modalTitle').textContent = getLang().confirm_clear_title;
            document.getElementById('modalMessage').textContent = getLang().confirm_clear_msg;
            const b = document.getElementById('modalConfirmBtn');
            b.textContent = getLang().confirm_clear_btn;
            b.onclick = clearLog;
            b.className = 'px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 font-semibold';
            openModal();
        }
        function clearLog() {
            if (isClearAll) { events = []; renderEventLog(); closeModal(); cancelEdit(); }
        }


        /*
        ========================================================================
        14. LOG EXPORTS
        ------------------------------------------------------------------------
        Export formats are intentionally local-only. No network calls. No upload.
        - Copy: copies the Quip-friendly Markdown summary to clipboard.
        - CSV: downloads a spreadsheet-friendly event log.
        - JSON: downloads the raw structured event data for later import/dev work.
        - Markdown: downloads the same Quip-friendly summary as a .md file.
        ========================================================================
        */
        function getExportRows() {
            return [...events].sort((a, b) => a.id - b.id).map(event => {
                const tq = parseTicket(event.ticket);
                const running = event.open || !event.endTime;
                return {
                    status: running ? 'Running' : 'Closed',
                    startTime: event.startTime || '',
                    endTime: running ? '' : (event.endTime || ''),
                    timeRange: running ? `${event.startTime || ''} (RUNNING)` : `${event.startTime || ''}-${event.endTime || ''}`,
                    ticketTitle: tq.title || '',
                    ticketUrl: tq.url || '',
                    issue: event.issue || '',
                    areas: (event.areas || []).join(', '),
                    downtimeMinutes: running ? '' : (event.downtime || 0),
                    goalLoss: running ? '' : (event.goalLoss || 0),
                    performanceLoss: running ? '' : (event.perfLoss || 0),
                    displayedLoss: running ? '' : (event.loss || 0),
                    method: running ? '' : ((event.perfLoss || 0) >= (event.goalLoss || 0) ? 'Performance' : 'Goal'),
                    pidGoal: event.pidGoal || '',
                    shiftHours: event.shiftHours || '',
                    previous15MinCartons: event.perf15 || ''
                };
            });
        }

        function buildQuipMarkdown() {
            const lang = getLang();
            const header = `${lang.quip_header}\n\n`;
            let table = `| ${lang.time_col} | ${lang.ticket_col} | ${lang.issue_col} | ${lang.areas_col} | ${lang.min_col} | ${lang.loss_col} |\n`;
            table += `|---|---|---|---|---|---|\n`;
            getExportRows().forEach(row => {
                const ticket = row.ticketUrl ? `[${row.ticketTitle}](${row.ticketUrl})` : row.ticketTitle;
                const minCol = row.status === 'Running' ? '-' : row.downtimeMinutes;
                const lossCol = row.status === 'Running' ? '-' : Number(row.displayedLoss || 0).toLocaleString();
                table += `| ${row.timeRange} | ${ticket} | ${row.issue} | ${row.areas} | ${minCol} | ${lossCol} |\n`;
            });
            const grandTotalLoss = events.reduce((s, e) => s + (e.loss || 0), 0);
            const totalDowntime = events.reduce((s, e) => s + (e.downtime || 0), 0);
            let footer = `\n---\n`;
            footer += `${lang.total_events_label} ${events.length}\n`;
            footer += `${lang.total_downtime_label} ${totalDowntime} ${lang.min_label}\n`;
            footer += `${lang.total_loss_label}: **${grandTotalLoss.toLocaleString()}**\n`;
            return header + table + footer;
        }

        function csvEscape(value) {
            const s = String(value ?? '');
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }

        function buildCsv() {
            const rows = getExportRows();
            const headers = [
                'status', 'startTime', 'endTime', 'timeRange', 'ticketTitle', 'ticketUrl',
                'issue', 'areas', 'downtimeMinutes', 'goalLoss', 'performanceLoss',
                'displayedLoss', 'method', 'pidGoal', 'shiftHours', 'previous15MinCartons'
            ];
            return [headers.join(','), ...rows.map(row => headers.map(h => csvEscape(row[h])).join(','))].join('\n');
        }

        function downloadText(filename, mimeType, text) {
            const blob = new Blob([text], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function copyText(text) {
            if (navigator.clipboard && window.isSecureContext) {
                return navigator.clipboard.writeText(text);
            }
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            return Promise.resolve();
        }

        function handleLogExport() {
            if (events.length === 0) { showToast('Log is empty. Add events first!'); return; }
            const formatEl = document.getElementById('exportFormat');
            const format = formatEl ? formatEl.value : 'copy';
            const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

            if (format === 'csv') {
                downloadText(`ibcl-event-log-${stamp}.csv`, 'text/csv;charset=utf-8', buildCsv());
                showToast('CSV exported.');
                return;
            }
            if (format === 'json') {
                const payload = {
                    exportedAt: new Date().toISOString(),
                    app: 'IBCL V2',
                    totals: {
                        events: events.length,
                        downtimeMinutes: events.reduce((s, e) => s + (e.downtime || 0), 0),
                        cartonLoss: events.reduce((s, e) => s + (e.loss || 0), 0)
                    },
                    events: getExportRows(),
                    projectionHistory: getProjectionHistory()
                };
                downloadText(`ibcl-event-log-${stamp}.json`, 'application/json;charset=utf-8', JSON.stringify(payload, null, 2));
                showToast('JSON exported.');
                return;
            }
            if (format === 'markdown') {
                downloadText(`ibcl-event-log-${stamp}.md`, 'text/markdown;charset=utf-8', buildQuipMarkdown());
                showToast('Markdown exported.');
                return;
            }

            copyText(buildQuipMarkdown()).then(() => showToast(getLang().toast_copied));
        }

        // Backward-compatible alias for older onclick handlers or saved local copies.
        function copyForQuip() { handleLogExport(); }


        /*
        ========================================================================
        15. TOAST NOTIFICATION
        ========================================================================
        */
        function showToast(message) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.classList.remove('opacity-0', 'translate-y-20');
            toast.classList.add('opacity-100', 'translate-y-0');
            setTimeout(() => {
                toast.classList.remove('opacity-100', 'translate-y-0');
                toast.classList.add('opacity-0', 'translate-y-20');
            }, 3000);
        }


        /*
        ========================================================================
        16. GRAPH VIEW ROADMAP
        ------------------------------------------------------------------------
        Keep this section boring until the data source is real.

        Proposed future data model:
          perfSamples = [
            { time: "23:00", cartons15: 1500 },
            { time: "23:15", cartons15: 2000 },
            ...
          ];

        Proposed future calculations:
          goalPacePerHour     = pidGoal / shiftHours
          rollingPerfPerHour  = average(cartons15 readings) * 4
          loggedLossTotal     = sum(events.loss)
          projectedShiftTotal = inferredProcessed + remainingPace - loggedLossTotal
          projectedDelta      = projectedShiftTotal - pidGoal

        Useful graph layers:
          1. Goal pace line.
          2. Rolling performance pace line.
          3. Loss markers from logged events.
          4. Projected end-of-shift delta.

        Do not poll internal pages or scrape values here until you can do it in a
        way that avoids credentials, cookies, tokens, or hardcoded confidential
        endpoints in the repository.
        ========================================================================
        */
        function renderGraphPlaceholder() {
            // Projection sketch is updated by updateThroughputAndProjection().
        }


        /*
        ========================================================================
        18. FLOWDESK COMPONENT HELPERS / V2 COCKPIT FEATURES
        ------------------------------------------------------------------------
        This is the bridge from one big HTML file toward real components. Each
        card should eventually become its own module, but these helpers keep the
        standalone file portable while adding the V2 cockpit behavior.
        ========================================================================
        */
        const ANIMATION_KEY = 'ibcl_animation_level_v2';
        const LIVE_UNLOCK_KEY = 'ibcl_live_dev_unlock_v2';
        const ANIMATION_LEVELS = ['off', 'calm', 'snappy', 'distract'];
        const ANIMATION_LABELS = ['Off', 'Calm', 'Snappy', 'Distract me'];
        let liveUnlockBuffer = '';

        function setAnimationLevel(level) {
            const idx = Math.max(0, Math.min(3, parseInt(level, 10) || 0));
            const mode = ANIMATION_LEVELS[idx];
            document.body.setAttribute('data-animation', mode);
            localStorage.setItem(ANIMATION_KEY, String(idx));
            const slider = document.getElementById('animationSlider');
            const label = document.getElementById('animationLabel');
            if (slider) slider.value = String(idx);
            if (label) { const lang = getLang(); label.textContent = [lang.anim_off_label, lang.anim_calm_label, lang.anim_snappy_label, lang.anim_distract_label][idx] || ANIMATION_LABELS[idx]; }
        }

        function initAnimationControls() {
            const saved = localStorage.getItem(ANIMATION_KEY);
            setAnimationLevel(saved === null ? 2 : saved);
        }

        function requestLiveMode() {
            if (localStorage.getItem(LIVE_UNLOCK_KEY) !== '1') {
                showToast(getLang().live_mode_locked_toast || 'Live Mode locked. Manual Mode only for now.');
                return;
            }
            showToast(getLang().live_mode_unlocked_toast || 'Dev Live Mode shell unlocked. No polling is wired yet.');
        }

        function updateLiveModeShell() {
            const unlocked = localStorage.getItem(LIVE_UNLOCK_KEY) === '1';
            document.body.classList.toggle('ibcl-live-unlocked', unlocked);
            const btn = document.getElementById('liveModeBtn');
            const hint = document.getElementById('liveModeHint');
            if (btn) {
                btn.classList.toggle('is-disabled', !unlocked);
                const lang = getLang();
                btn.innerHTML = unlocked
                    ? `<i class="fas fa-flask mr-1"></i>${lang.live_dev_shell_label || 'Live Dev Shell'}`
                    : `<i class="fas fa-satellite-dish mr-1"></i>${lang.live_locked_label || 'Live Locked'}`;
            }
            if (hint) {
                const lang = getLang();
                hint.textContent = unlocked
                    ? (lang.live_mode_hint_unlocked || 'Dev shell unlocked. Still does not poll internal systems or store endpoints.')
                    : (lang.live_mode_hint_locked || 'Secret dev unlock exists, but Manual Mode remains the only production-safe mode.');
            }
        }

        function initLiveModeEasterEgg() {
            updateLiveModeShell();
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey || e.altKey || e.metaKey) return;
                const k = (e.key || '').toLowerCase();
                if (!/^[a-z0-9]$/.test(k)) return;
                liveUnlockBuffer = (liveUnlockBuffer + k).slice(-12);
                if (liveUnlockBuffer.endsWith('flowstate')) {
                    localStorage.setItem(LIVE_UNLOCK_KEY, '1');
                    updateLiveModeShell();
                    showToast(getLang().live_mode_unlocked_toast || 'Live dev shell unlocked. Manual Mode still active.');
                }
            });
        }

        function updateThroughputAndProjection(activeLoss = 0, totalLoss = 0) {
            const pidGoal = parseFloat(document.getElementById('pidGoal')?.value) || 0;
            const shiftHours = parseFloat(document.getElementById('shiftHours')?.value) || 0;
            const perf15 = parseFloat(document.getElementById('perf15')?.value) || 0;
            const goalPace = (pidGoal > 0 && shiftHours > 0) ? pidGoal / shiftHours : 0;
            const manualPace = perf15 > 0 ? perf15 * 4 : 0;
            const deltaPace = manualPace - goalPace;
            const projectedDelta = deltaPace * Math.max(shiftHours, 0) - totalLoss;

            const paceEl = document.getElementById('metricThroughputPace');
            const deltaEl = document.getElementById('metricThroughputDelta');
            const arrowEl = document.getElementById('metricThroughputArrow');
            if (paceEl) paceEl.textContent = fmtNum(manualPace);
            if (deltaEl) deltaEl.textContent = (deltaPace >= 0 ? '+' : '') + fmtNum(deltaPace);
            if (arrowEl) {
                arrowEl.className = 'fas ibcl-throughput-arrow ' + (deltaPace > 25 ? 'fa-arrow-up up' : deltaPace < -25 ? 'fa-arrow-down down' : 'fa-minus flat');
            }

            const gGoal = document.getElementById('graphGoalPace');
            const gManual = document.getElementById('graphManualPace');
            const gDelta = document.getElementById('graphProjectedDelta');
            if (gGoal) gGoal.textContent = fmtNum(goalPace);
            if (gManual) gManual.textContent = fmtNum(manualPace);
            if (gDelta) {
                gDelta.textContent = (projectedDelta >= 0 ? '+' : '') + fmtNum(projectedDelta) + ' cartons';
                gDelta.className = 'text-sm font-bold ' + (projectedDelta >= 0 ? 'text-emerald-600' : 'text-red-600');
            }
            recordProjectionSample(false, { goalPace, manualPace, totalLoss, activeLoss, projectedDelta });
            updateProjectedFinishBars(goalPace, manualPace, totalLoss, shiftHours);
            drawProjectionSketch(goalPace, manualPace, totalLoss, shiftHours, projectedDelta);
        }

        const PROJECTION_SETTINGS_KEY = 'ibcl_projection_settings_v2';
        let projectionSettings = { shiftPreset: 'nights', overtime: false, sampleInterval: 15 };

        function loadProjectionSettings() {
            try {
                const saved = JSON.parse(localStorage.getItem(PROJECTION_SETTINGS_KEY) || '{}') || {};
                projectionSettings = Object.assign({}, projectionSettings, saved);
            } catch (_) {}
            const preset = document.getElementById('shiftPresetSelect');
            const ot = document.getElementById('shiftOtToggle');
            const interval = document.getElementById('sampleIntervalSelect');
            if (preset) preset.value = projectionSettings.shiftPreset || 'nights';
            if (ot) ot.checked = !!projectionSettings.overtime;
            if (interval) interval.value = String(projectionSettings.sampleInterval || 15);
            updateShiftWindowDisplay();
        }

        function saveProjectionSettings() {
            localStorage.setItem(PROJECTION_SETTINGS_KEY, JSON.stringify(projectionSettings));
            updateShiftWindowDisplay();
            scheduleProjectionSampler();
            if (typeof updateThroughputAndProjection === 'function') updateThroughputAndProjection(
                parseFloat((document.getElementById('metricActiveLoss')?.textContent || '0').replace(/,/g, '')) || 0,
                parseFloat((document.getElementById('metricTotalLoss')?.textContent || '0').replace(/,/g, '')) || 0
            );
        }

        function setProjectionShiftPreset(value) { projectionSettings.shiftPreset = value || 'nights'; saveProjectionSettings(); }
        function setProjectionOT(checked) { projectionSettings.overtime = !!checked; saveProjectionSettings(); }
        function setProjectionSampleInterval(value) { projectionSettings.sampleInterval = Math.max(5, parseInt(value, 10) || 15); saveProjectionSettings(); }

        function scheduleProjectionSampler() {
            if (projectionSampleTimer) clearInterval(projectionSampleTimer);
            projectionSampleTimer = null;
            // Keep graph history alive even when no tickets are being entered.
            // The function only stores one row per selected bucket, so polling once
            // per minute is safe and still respects the selected sample interval.
            projectionSampleTimer = setInterval(() => {
                recordProjectionSample(false);
            }, 60000);
        }

        function makeDateAtHM(baseDate, hm) {
            const [h, m] = hm.split(':').map(Number);
            const d = new Date(baseDate);
            d.setHours(h, m || 0, 0, 0);
            return d;
        }

        function getShiftWindow(now = new Date()) {
            const preset = projectionSettings.shiftPreset || 'nights';
            const ot = !!projectionSettings.overtime;
            let startHM = preset === 'days' ? '07:00' : '19:00';
            let endHM = preset === 'days' ? (ot ? '18:30' : '17:30') : (ot ? '06:30' : '05:30');
            let start = makeDateAtHM(now, startHM);
            let end = makeDateAtHM(now, endHM);
            if (preset === 'nights') {
                // If it is after midnight but before the night-shift end, anchor start to the previous calendar day.
                if (now.getHours() < 12) start.setDate(start.getDate() - 1);
                end = makeDateAtHM(start, endHM);
                end.setDate(end.getDate() + 1);
            }
            return { preset, startHM, endHM, start, end, interval: projectionSettings.sampleInterval || 15 };
        }

        function updateShiftWindowDisplay() {
            const el = document.getElementById('shiftWindowDisplay');
            if (!el) return;
            const w = getShiftWindow();
            el.textContent = `${w.startHM}-${w.endHM} · ${w.interval}m`;
        }

        function localDateKey(d) {
            const y = d.getFullYear();
            const mo = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const h = String(d.getHours()).padStart(2, '0');
            const m = String(d.getMinutes()).padStart(2, '0');
            return `${y}-${mo}-${day}T${h}:${m}`;
        }

        function currentProjectionBucket() {
            const d = new Date();
            const interval = projectionSettings.sampleInterval || 15;
            const bucketMinutes = Math.floor(d.getMinutes() / interval) * interval;
            d.setMinutes(bucketMinutes, 0, 0);
            const h = String(d.getHours()).padStart(2, '0');
            const m = String(d.getMinutes()).padStart(2, '0');
            return { id: localDateKey(d), label: `${h}:${m}`, date: d };
        }

        const PROJECTION_HISTORY_KEY = 'ibcl_projection_history_v2';

        function getProjectionHistory() {
            try { return JSON.parse(localStorage.getItem(PROJECTION_HISTORY_KEY) || '[]') || []; }
            catch (_) { return []; }
        }

        function saveProjectionHistory(history) {
            localStorage.setItem(PROJECTION_HISTORY_KEY, JSON.stringify(history.slice(-288)));
        }

        function recordProjectionSample(force = false, snapshot = null) {
            const pidGoal = parseFloat(document.getElementById('pidGoal')?.value) || 0;
            const shiftHours = parseFloat(document.getElementById('shiftHours')?.value) || 0;
            const perf15 = parseFloat(document.getElementById('perf15')?.value) || 0;
            if (!snapshot) {
                const goalPace = (pidGoal > 0 && shiftHours > 0) ? pidGoal / shiftHours : 0;
                const manualPace = perf15 > 0 ? perf15 * 4 : 0;
                const totalLoss = parseFloat((document.getElementById('metricTotalLoss')?.textContent || '0').replace(/,/g, '')) || 0;
                const activeLoss = parseFloat((document.getElementById('metricActiveLoss')?.textContent || '0').replace(/,/g, '')) || 0;
                const projectedDelta = (manualPace - goalPace) * Math.max(shiftHours, 0) - totalLoss;
                snapshot = { goalPace, manualPace, totalLoss, activeLoss, projectedDelta };
            }
            if (!pidGoal || !shiftHours) return;
            const bucket = currentProjectionBucket();
            const history = getProjectionHistory();
            const idx = history.findIndex(s => s.bucket === bucket.id);
            const row = {
                bucket: bucket.id,
                label: bucket.label,
                recordedAt: new Date().toISOString(),
                pidGoal, shiftHours, perf15,
                shiftPreset: projectionSettings.shiftPreset, overtime: !!projectionSettings.overtime, sampleInterval: projectionSettings.sampleInterval || 15,
                goalPace: Math.round(snapshot.goalPace || 0),
                manualPace: Math.round(snapshot.manualPace || 0),
                totalLoss: Math.round(snapshot.totalLoss || 0),
                activeLoss: Math.round(snapshot.activeLoss || 0),
                projectedDelta: Math.round(snapshot.projectedDelta || 0)
            };
            if (idx >= 0) {
                // Auto sampling keeps the first reading in a bucket so the line does not
                // jitter every few seconds. Manual Record Now overwrites that bucket.
                if (force) history[idx] = row;
            } else {
                history.push(row);
            }
            saveProjectionHistory(history);
            drawProjectionSketch(row.goalPace, row.manualPace, row.totalLoss, shiftHours, row.projectedDelta);
            if (force && typeof showToast === 'function') showToast('Throughput sample recorded.');
        }

        function clearProjectionHistory() {
            localStorage.removeItem(PROJECTION_HISTORY_KEY);
            drawProjectionSketch(0, 0, 0, 0, 0);
            if (typeof showToast === 'function') showToast('Projection history cleared.');
        }

        function eventDateForHM(hm, shiftStart) {
            if (!hm) return null;
            const d = makeDateAtHM(shiftStart, hm);
            if (d < shiftStart) d.setDate(d.getDate() + 1);
            return d;
        }

        function calculateCumulativeLossTo(cutoffDate, shiftStart) {
            let total = 0;
            events.forEach(ev => {
                const evStart = eventDateForHM(ev.startTime, shiftStart);
                if (!evStart || cutoffDate <= evStart) return;
                let evEnd = (ev.open || !ev.endTime) ? new Date() : eventDateForHM(ev.endTime, shiftStart);
                if (!evEnd) return;
                if (evEnd < evStart) evEnd.setDate(evEnd.getDate() + 1);
                const overlapEnd = new Date(Math.min(cutoffDate.getTime(), evEnd.getTime()));
                const mins = Math.max(0, Math.round((overlapEnd - evStart) / 60000));
                if (mins > 0) {
                    total += computeLossValues(mins, ev.weight, ev.pidGoal, ev.shiftHours, ev.perf15, ev.presortCount || 0).loss || 0;
                }
            });
            return Math.round(total);
        }

        function getPaceSamples() {
            return getProjectionHistory()
                .filter(s => s && s.bucket && Number.isFinite(Number(s.manualPace)))
                .sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)));
        }

        function paceAtBucket(bucketDate, samples, fallbackPace) {
            const id = localDateKey(bucketDate);
            let pace = fallbackPace;
            samples.forEach(s => { if (String(s.bucket) <= id) pace = Number(s.manualPace) || pace; });
            return pace;
        }

        function buildShiftProjectionSeries(goalPace, manualPace) {
            const w = getShiftWindow();
            const points = [];
            const samples = getPaceSamples();
            const interval = Math.max(5, Number(w.interval) || 15);
            for (let d = new Date(w.start); d <= w.end; d = new Date(d.getTime() + interval * 60000)) {
                const elapsedHours = Math.max(0, (d - w.start) / 3600000);
                const pace = paceAtBucket(d, samples, manualPace);
                const loss = calculateCumulativeLossTo(d, w.start);
                const delta = Math.round((pace - goalPace) * elapsedHours - loss);
                points.push({
                    id: localDateKey(d),
                    label: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
                    projectedDelta: delta,
                    manualPace: Math.round(pace),
                    totalLoss: loss
                });
            }
            return points;
        }

        function clampProjectionPercent(value, max = 100) {
            return Math.max(0, Math.min(max, Number(value) || 0));
        }

        function projectionStatusClass(percent) {
            if (percent >= 100) return 'good';
            if (percent >= 95) return 'neutral';
            if (percent >= 90) return 'warn';
            return 'bad';
        }

        function setProjectionStatusClass(el, cls) {
            if (!el) return;
            el.classList.remove('good', 'neutral', 'warn', 'bad');
            el.classList.add(cls);
        }

        function integratePaceTo(cutoffDate, fallbackPace) {
            const w = getShiftWindow();
            const end = new Date(Math.max(w.start.getTime(), Math.min(cutoffDate.getTime(), w.end.getTime())));
            if (end <= w.start) return 0;
            const interval = Math.max(5, Number(w.interval) || 15);
            const samples = getPaceSamples();
            let total = 0;
            for (let d = new Date(w.start); d < end; d = new Date(d.getTime() + interval * 60000)) {
                const next = new Date(Math.min(end.getTime(), d.getTime() + interval * 60000));
                const hours = Math.max(0, (next - d) / 3600000);
                const pace = paceAtBucket(d, samples, fallbackPace || 0);
                total += (Number(pace) || 0) * hours;
            }
            return Math.round(total);
        }

        function updateProjectedFinishBars(goalPace, manualPace, totalLoss, shiftHours) {
            const pidGoal = parseFloat(document.getElementById('pidGoal')?.value) || 0;
            const w = getShiftWindow();
            const now = new Date();
            const currentRaw = integratePaceTo(now, manualPace || 0);
            const currentLoss = calculateCumulativeLossTo(now, w.start);
            const currentProcessed = Math.max(0, Math.round(currentRaw - currentLoss));
            const projectedRaw = integratePaceTo(w.end, manualPace || 0);
            const projectedLoss = calculateCumulativeLossTo(w.end, w.start);
            const projectedProcessed = Math.max(0, Math.round(projectedRaw - projectedLoss));
            const projectedDelta = Math.round(projectedProcessed - pidGoal);
            const currentPct = pidGoal > 0 ? (currentProcessed / pidGoal) * 100 : 0;
            const projectedPct = pidGoal > 0 ? (projectedProcessed / pidGoal) * 100 : 0;
            const status = projectionStatusClass(projectedPct);

            const projectedDeltaEl = document.getElementById('projectedFinishDelta');
            const projectedPctEl = document.getElementById('projectedFinishPercent');
            const projectedBar = document.getElementById('projectedFinishBar');
            const projectedCaption = document.getElementById('projectedFinishCaption');
            const processedValueEl = document.getElementById('processedProgressValue');
            const processedPctEl = document.getElementById('processedProgressPercent');
            const processedBar = document.getElementById('processedProgressBar');
            const processedCaption = document.getElementById('processedProgressCaption');

            if (projectedDeltaEl) projectedDeltaEl.textContent = (projectedDelta >= 0 ? '+' : '') + fmtNum(projectedDelta);
            if (projectedPctEl) projectedPctEl.textContent = (projectedPct || 0).toFixed(1).replace('.0', '') + '%';
            if (projectedBar) {
                projectedBar.classList.remove('good', 'neutral', 'warn', 'bad');
                projectedBar.classList.add(status);
                projectedBar.style.width = clampProjectionPercent((projectedPct / 150) * 100, 100).toFixed(2) + '%';
            }
            if (projectedCaption) projectedCaption.textContent = `${fmtNum(projectedProcessed)} projected / ${fmtNum(pidGoal)} goal`;
            setProjectionStatusClass(projectedDeltaEl, status);
            setProjectionStatusClass(projectedPctEl, status);

            if (processedValueEl) processedValueEl.textContent = fmtNum(currentProcessed);
            if (processedPctEl) processedPctEl.textContent = (currentPct || 0).toFixed(1).replace('.0', '') + '%';
            if (processedBar) processedBar.style.width = clampProjectionPercent(currentPct, 100).toFixed(2) + '%';
            if (processedCaption) processedCaption.textContent = `${fmtNum(currentProcessed)} estimated / ${fmtNum(pidGoal)} goal`;
        }

        function drawProjectionSketch(goalPace, manualPace, totalLoss, shiftHours, projectedDelta = 0) {
            const goal = document.getElementById('graphGoalLine');
            const perf = document.getElementById('graphPerfLine');
            const loss = document.getElementById('graphLossLine');
            const histPath = document.getElementById('graphHistoryLine');
            const currentPath = document.getElementById('graphCurrentLine');
            const zeroLine = document.getElementById('graphZeroLine');
            const dots = document.getElementById('graphHistoryDots');
            const countEl = document.getElementById('graphHistoryCount');
            const lastEl = document.getElementById('graphHistoryLast');
            if (!goal || !perf || !loss) return;

            updateShiftWindowDisplay();
            const samples = getPaceSamples();
            const w = getShiftWindow();
            const inShiftSamples = samples
                .map(s => Object.assign({}, s, { date: new Date(s.bucket) }))
                .filter(s => !isNaN(s.date) && s.date >= w.start && s.date <= w.end)
                .map(s => {
                    const elapsedHours = Math.max(0, (s.date - w.start) / 3600000);
                    const pace = Number(s.manualPace) || manualPace || 0;
                    const lossToPoint = calculateCumulativeLossTo(s.date, w.start);
                    return Object.assign({}, s, {
                        label: `${String(s.date.getHours()).padStart(2,'0')}:${String(s.date.getMinutes()).padStart(2,'0')}`,
                        projectedDelta: Math.round((pace - (goalPace || 0)) * elapsedHours - lossToPoint),
                        totalLoss: lossToPoint
                    });
                });

            // Include the current bucket as a live endpoint so the graph is still useful
            // between stored samples without pretending every minute is a saved point.
            const now = new Date();
            const liveElapsed = Math.max(0, (now - w.start) / 3600000);
            const liveLoss = calculateCumulativeLossTo(now, w.start);
            const livePoint = {
                bucket: localDateKey(now),
                label: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
                projectedDelta: Math.round(((manualPace || 0) - (goalPace || 0)) * liveElapsed - liveLoss),
                manualPace: Math.round(manualPace || 0),
                totalLoss: liveLoss,
                date: now,
                live: true
            };
            const series = inShiftSamples.length && inShiftSamples[inShiftSamples.length - 1].bucket === livePoint.bucket
                ? inShiftSamples
                : inShiftSamples.concat(livePoint).filter(pt => pt.date >= w.start && pt.date <= w.end);

            if (countEl) countEl.textContent = String(inShiftSamples.length);
            if (lastEl) lastEl.textContent = series.length ? `${series[series.length - 1].label} ${series[series.length - 1].projectedDelta >= 0 ? '+' : ''}${fmtNum(series[series.length - 1].projectedDelta)}` : '—';

            if (series.length >= 2 && histPath) {
                const values = series.map(s => s.projectedDelta || 0).concat([0]);
                const min = Math.min(...values);
                const max = Math.max(...values);
                const pad = Math.max(250, (max - min) * 0.12);
                const lo = min - pad;
                const hi = max + pad;
                const xForDate = (date) => 35 + Math.max(0, Math.min(1, (date - w.start) / Math.max(1, (w.end - w.start)))) * 540;
                const y = (v) => 155 - ((v - lo) / Math.max(1, hi - lo)) * 125;
                const d = series.map((pt, i) => `${i ? 'L' : 'M'}${xForDate(pt.date).toFixed(1)} ${y(pt.projectedDelta || 0).toFixed(1)}`).join(' ');
                histPath.setAttribute('d', d);
                if (zeroLine) {
                    const zy = y(0).toFixed(1);
                    zeroLine.setAttribute('y1', zy);
                    zeroLine.setAttribute('y2', zy);
                }
                if (currentPath) currentPath.setAttribute('d', '');
                if (dots) {
                    const stride = Math.max(1, Math.ceil(series.length / 24));
                    dots.innerHTML = series.map((pt, i) => i % stride === 0 || i === series.length - 1 || pt.live
                        ? `<circle class="ibcl-graph-dot" cx="${xForDate(pt.date).toFixed(1)}" cy="${y(pt.projectedDelta || 0).toFixed(1)}" r="${pt.live ? 4 : 3}"><title>${pt.live ? 'Live ' : ''}${pt.label}: ${(pt.projectedDelta || 0) >= 0 ? '+' : ''}${fmtNum(pt.projectedDelta || 0)} cartons</title></circle>`
                        : '').join('');
                }
                goal.setAttribute('d', '');
                perf.setAttribute('d', '');
                loss.setAttribute('d', '');
                return;
            }

            const maxPace = Math.max(goalPace, manualPace, 1);
            const y = (v) => 155 - Math.max(0, Math.min(1, v / maxPace)) * 115;
            const lossPenalty = shiftHours > 0 ? totalLoss / shiftHours : 0;
            const adjusted = Math.max(0, manualPace - lossPenalty);
            goal.setAttribute('d', `M35 155 L575 ${y(goalPace).toFixed(1)}`);
            perf.setAttribute('d', `M35 155 L575 ${y(manualPace).toFixed(1)}`);
            loss.setAttribute('d', `M35 155 L575 ${y(adjusted).toFixed(1)}`);
            if (histPath) histPath.setAttribute('d', '');
            if (currentPath) currentPath.setAttribute('d', '');
            if (dots) dots.innerHTML = '';
            if (zeroLine) { zeroLine.setAttribute('y1', '95'); zeroLine.setAttribute('y2', '95'); }
        }
